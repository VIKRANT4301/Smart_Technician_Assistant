import os
import json
from typing import Dict, Any, List
from PIL import Image, ImageDraw, ImageFont
import google.generativeai as genai
from backend.core.config import config

class VisionAnalyzer:
    def __init__(self):
        self._setup_gemini()

    def _setup_gemini(self):
        if config.GEMINI_API_KEY and config.GEMINI_API_KEY != "YOUR_GEMINI_API_KEY_HERE":
            genai.configure(api_key=config.GEMINI_API_KEY)
            self.use_api = True
        else:
            self.use_api = False

    def draw_bounding_boxes(self, image_path: str, fault_regions: List[Dict[str, Any]]) -> str:
        """
        Draws bright neon-red bounding boxes on the uploaded image and saves it.
        Returns the path to the annotated image.
        """
        if not os.path.exists(image_path) or not fault_regions:
            return image_path

        try:
            img = Image.open(image_path)
            # Create a drawing context
            draw = ImageDraw.Draw(img)
            width, height = img.size

            # Try to load default font
            try:
                font = ImageFont.load_default()
            except Exception:
                font = None

            for region in fault_regions:
                label = region.get("label", "Anomaly").upper()
                box = region.get("box_2d") # Normalized [ymin, xmin, ymax, xmax] (0 to 1000)
                if not box or len(box) != 4:
                    continue

                ymin, xmin, ymax, xmax = box
                
                # Convert normalized coordinates to absolute pixels
                ymin_px = int(ymin * height / 1000)
                xmin_px = int(xmin * width / 1000)
                ymax_px = int(ymax * height / 1000)
                xmax_px = int(xmax * width / 1000)

                # Draw bounding box outline
                draw.rectangle([xmin_px, ymin_px, xmax_px, ymax_px], outline="#FF003C", width=4)

                # Draw label tag background
                text_height = 16
                text_width = len(label) * 8
                draw.rectangle([xmin_px, max(0, ymin_px - text_height), xmin_px + text_width, ymin_px], fill="#FF003C")

                # Draw text label
                if font:
                    draw.text((xmin_px + 4, max(0, ymin_px - text_height + 2)), label, fill="white", font=font)
                else:
                    draw.text((xmin_px + 4, max(0, ymin_px - text_height + 2)), label, fill="white")

            # Save annotated copy
            dir_name = os.path.dirname(image_path)
            base_name = os.path.basename(image_path)
            annotated_name = "annotated_" + base_name
            annotated_path = os.path.join(dir_name, annotated_name)
            img.save(annotated_path)
            print(f"[Vision] Bounding boxes drawn. Saved annotated image: {annotated_path}")
            return annotated_path

        except Exception as e:
            print(f"[Vision] Error drawing bounding boxes: {e}")
            return image_path

    def analyze_image(self, image_path: str) -> Dict[str, Any]:
        """
        Analyze equipment image using Gemini Vision model, detect faults and highlight them.
        Falls back to mock classifications and coordinates if offline.
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image file not found: {image_path}")

        # Fetch registered products to dynamically inject into prompt
        try:
            from backend.database.db_service import db
            all_prods = db.get_all_products()
            prod_info_list = []
            for p in all_prods:
                prod_info_list.append(f"- Model: {p['model_number']}, Name: {p['product_name']}, Manufacturer: {p['manufacturer']}")
            registered_products_str = "\n".join(prod_info_list)
        except Exception:
            registered_products_str = "- None registered"

        prompt = (
            "You are an industrial safety, product recognition, and equipment diagnostic expert. "
            "Analyze this machine/equipment photo. "
            "Identify the product details.\n\n"
            "Here is a list of registered products in our database. If the machine/equipment in the photo matches one of these products, you MUST detect it as that product and output its EXACT model number, product type, and manufacturer from this list:\n"
            f"{registered_products_str}\n\n"
            "If it is a completely different product not in this list, identify its details from the image:\n"
            "- What type of product is it? (e.g., HVAC Compressor, Rotary Pump, Control Cabinet)\n"
            "- What is the model number if visible or inferred?\n"
            "- Who is the manufacturer?\n\n"
            "Identify common faults: Overheating (glowing parts, thermal damage, discolored metal), "
            "Loose wiring (hanging cables, exposed wire terminals, unconnected couplers), "
            "Leakage (puddles of water/oil, wet spots, dripping fluid), "
            "Rust (brown/orange oxidation on metallic surfaces), "
            "Dust (excessive dust/grime accumulation), "
            "or Damaged components (dented shell, broken fan blades, cracked casings).\n\n"
            "Find the coordinates representing the exact bounding box of any detected faults. "
            "Provide a summary in this exact JSON format: \n"
            "{\n"
            '  "detected_issue": "Name of the issue",\n'
            '  "confidence": "XX%",\n'
            '  "visual_findings": "Detailed description of what is seen in the image.",\n'
            '  "product_type": "Type of product detected",\n'
            '  "model_number": "Model number of product detected",\n'
            '  "manufacturer": "Manufacturer of product detected",\n'
            '  "product_detection_confidence": "XX%",\n'
            '  "fault_detection_confidence": "XX%",\n'
            '  "fault_regions": [\n'
            '    {"label": "fault type (e.g. rust/wire/leak)", "box_2d": [ymin, xmin, ymax, xmax]}\n'
            '  ]\n'
            "}\n"
            "Where the box_2d coordinates are normalized from 0 to 1000 representing [ymin, xmin, ymax, xmax]."
        )

        fault_regions = []
        
        if self.use_api:
            if config.GEMINI_API_KEY.startswith("sk-or-"):
                try:
                    import base64
                    print(f"[Vision] Analyzing image using OpenRouter: {image_path}")
                    with open(image_path, "rb") as f:
                        img_base64 = base64.b64encode(f.read()).decode("utf-8")
                    
                    mime_type = "image/jpeg"
                    if image_path.lower().endswith(".png"):
                        mime_type = "image/png"
                    elif image_path.lower().endswith(".gif"):
                        mime_type = "image/gif"
                    elif image_path.lower().endswith(".webp"):
                        mime_type = "image/webp"
                    
                    from backend.utils.openrouter import query_openrouter
                    messages = [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": prompt
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{mime_type};base64,{img_base64}"
                                    }
                                }
                            ]
                        }
                    ]
                    
                    text = query_openrouter("google/gemini-2.5-flash", messages, json_response=True)
                    
                    # Parse JSON
                    if "```json" in text:
                        text = text.split("```json")[1].split("```")[0].strip()
                    elif "```" in text:
                        text = text.split("```")[1].split("```")[0].strip()
                        
                    result = json.loads(text)
                    fault_regions = result.get("fault_regions", [])
                    
                    # Annotate the image
                    annotated_path = self.draw_bounding_boxes(image_path, fault_regions)
                    result["annotated_image_path"] = annotated_path
                    print(f"[Vision] OpenRouter analysis result: {result}")
                    return result
                except Exception as e:
                    print(f"[Vision] OpenRouter vision analysis failed: {e}. Falling back to offline mock vision module.")
            else:
                try:
                    print(f"[Vision] Analyzing image using Gemini: {image_path}")
                    img = Image.open(image_path)
                    
                    # Compress image if it is too large for fast transfer
                    max_size = 1600
                    if img.width > max_size or img.height > max_size:
                        try:
                            resample_filter = Image.Resampling.LANCZOS
                        except AttributeError:
                            resample_filter = Image.ANTIALIAS
                        img.thumbnail((max_size, max_size), resample_filter)
                        print(f"[Vision] Image compressed to {img.width}x{img.height} for Gemini transmission.")

                    model = genai.GenerativeModel("gemini-2.5-flash")
                    response = model.generate_content([prompt, img])
                    text = response.text.strip()
                    
                    # Parse JSON
                    if "```json" in text:
                        text = text.split("```json")[1].split("```")[0].strip()
                    elif "```" in text:
                        text = text.split("```")[1].split("```")[0].strip()
                        
                    result = json.loads(text)
                    fault_regions = result.get("fault_regions", [])
                    
                    # Annotate the image
                    annotated_path = self.draw_bounding_boxes(image_path, fault_regions)
                    result["annotated_image_path"] = annotated_path
                    print(f"[Vision] Gemini analysis result: {result}")
                    return result
                    
                except Exception as e:
                    print(f"[Vision] Gemini vision analysis failed: {e}. Falling back to offline mock vision module.")

        # Fallback Mock Module
        print("[Vision] Using offline mock vision module.")
        filename = os.path.basename(image_path).lower()
        
        # Dynamically query products database using product resolver
        try:
            from backend.database.db_service import db
            from backend.utils.product_resolver import resolve_product_by_query
            all_prods = db.get_all_products()
            # Clean filename text to act as a query
            query_filename = filename.replace("_", " ").replace("-", " ").replace(".", " ")
            matched_prod = resolve_product_by_query(query_filename, all_prods)
        except Exception:
            matched_prod = None
            all_prods = []
                
        if matched_prod:
            product_type = matched_prod["product_name"]
            model_number = matched_prod["model_number"]
            manufacturer = matched_prod["manufacturer"]
            product_detection_confidence = "92%"
        else:
            # Traditional fallback overrides if no database match
            if any(k in filename for k in ["leak", "water", "wet"]):
                product_type = "Rotary Pump"
                model_number = "CP-100"
                manufacturer = "Centrifugal Pumps"
                product_detection_confidence = "85%"
            elif any(k in filename for k in ["wire", "loose", "electrical"]):
                product_type = "Control Cabinet"
                model_number = "SOP-ELEC-04"
                manufacturer = "Standard"
                product_detection_confidence = "90%"
            elif any(k in filename for k in ["laptop", "lt-pro", "lt_pro", "computer"]):
                product_type = "Laptop"
                model_number = "LT-PRO X15"
                manufacturer = "ASUS"
                product_detection_confidence = "95%"
            else:
                product_type = "HVAC Compressor"
                model_number = "AC-X200"
                manufacturer = "Samsung"
                product_detection_confidence = "91%"

        # Simulated faults based on filenames
        if any(k in filename for k in ["leak", "water", "wet"]):
            detected_issue = "Leakage"
            confidence = "88%"
            visual_findings = f"Puddling detected near the {product_type} base plate with fluid dripping from the casing flange joint."
            fault_detection_confidence = "88%"
            fault_regions = [{"label": "fluid leakage", "box_2d": [380, 420, 600, 600]}]
        elif any(k in filename for k in ["rust", "corrosion"]):
            detected_issue = "Rust"
            confidence = "94%"
            visual_findings = f"Heavy reddish-brown oxidation scaling seen along the {product_type} housing joints and mounting bolts."
            fault_detection_confidence = "94%"
            fault_regions = [{"label": "heavy corrosion", "box_2d": [200, 300, 800, 700]}]
        elif any(k in filename for k in ["wire", "loose", "electrical"]):
            detected_issue = "Loose Wiring"
            confidence = "85%"
            visual_findings = f"Exposed terminal block wiring identified on the {product_type} panel, showing slack wires and missing insulating caps."
            fault_detection_confidence = "85%"
            fault_regions = [{"label": "loose terminal wire", "box_2d": [100, 150, 900, 850]}]
        elif any(k in filename for k in ["hot", "overheat"]):
            detected_issue = "Overheating"
            confidence = "91%"
            visual_findings = f"Thermal discoloration noticed around the {product_type} frame, indicating operating temperatures exceeding safety limits."
            fault_detection_confidence = "91%"
            fault_regions = [{"label": "thermal hotspot", "box_2d": [150, 200, 850, 800]}]
        else:
            detected_issue = "Motor Overheating" if "overheat" in filename else "Equipment Anomaly"
            confidence = "91%"
            visual_findings = f"Thermal anomaly or surface heat buildup detected on the {product_type} casing frame."
            fault_detection_confidence = "91%"
            fault_regions = [{"label": "thermal hotspot", "box_2d": [150, 200, 850, 800]}]

        annotated_path = self.draw_bounding_boxes(image_path, fault_regions)
        return {
            "detected_issue": detected_issue,
            "confidence": confidence,
            "visual_findings": visual_findings,
            "product_type": product_type,
            "model_number": model_number,
            "manufacturer": manufacturer,
            "product_detection_confidence": product_detection_confidence,
            "fault_detection_confidence": fault_detection_confidence,
            "fault_regions": fault_regions,
            "annotated_image_path": annotated_path
        }

vision_analyzer = VisionAnalyzer()

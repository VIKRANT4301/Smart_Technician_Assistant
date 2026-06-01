import axios from 'axios';
import { Platform } from 'react-native';

// Default backend URL configuration
// 192.168.1.2 is the host machine LAN IP; 127.0.0.1 is iOS Simulator/Web.
let BASE_URL = Platform.OS === 'web' ? 'http://127.0.0.1:8000' : 'http://192.168.1.9:8000';

export const getBackendUrl = () => BASE_URL;

export const setBackendUrl = (url: string) => {
  // Strip trailing slashes
  BASE_URL = url.replace(/\/+$/, '');
  console.log(`[API] Base URL updated to: ${BASE_URL}`);
};

/**
 * Upload image and return standalone vision details.
 */
export const uploadImage = async (imageUri: string) => {
  const formData = new FormData();
  
  // Extract filename
  const filename = imageUri.split('/').pop() || 'photo.jpg';

  if (Platform.OS === 'web') {
    const res = await fetch(imageUri);
    const blob = await res.blob();
    formData.append('file', blob, filename);
  } else {
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : `image/jpeg`;
    // React Native FormData requires this structure for files
    formData.append('file', {
      uri: imageUri,
      name: filename,
      type
    } as any);
  }

  const response = await axios.post(`${BASE_URL}/upload-image`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

/**
 * Upload audio and return text transcript.
 */
export const uploadAudio = async (audioUri: string) => {
  const formData = new FormData();
  const filename = audioUri.split('/').pop() || 'recording.m4a';
  
  if (Platform.OS === 'web') {
    const res = await fetch(audioUri);
    const blob = await res.blob();
    formData.append('file', blob, filename);
  } else {
    formData.append('file', {
      uri: audioUri,
      name: filename,
      type: 'audio/m4a'
    } as any);
  }

  const response = await axios.post(`${BASE_URL}/upload-audio`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

/**
 * Integrated analyze pipeline endpoint.
 * Takes image URI (optional), audio URI (optional), and query string (optional).
 */
export const analyzeDiagnostic = async (params: {
  imageUri?: string | null;
  audioUri?: string | null;
  queryText?: string | null;
  manualUrl?: string | null;
}) => {
  const formData = new FormData();

  if (params.imageUri) {
    const filename = params.imageUri.split('/').pop() || 'photo.jpg';
    if (Platform.OS === 'web') {
      const res = await fetch(params.imageUri);
      const blob = await res.blob();
      formData.append('image', blob, filename);
    } else {
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;
      formData.append('image', {
        uri: params.imageUri,
        name: filename,
        type
      } as any);
    }
  }

  if (params.audioUri) {
    const filename = params.audioUri.split('/').pop() || 'recording.m4a';
    if (Platform.OS === 'web') {
      const res = await fetch(params.audioUri);
      const blob = await res.blob();
      formData.append('audio', blob, filename);
    } else {
      formData.append('audio', {
        uri: params.audioUri,
        name: filename,
        type: 'audio/m4a'
      } as any);
    }
  }

  if (params.queryText) {
    formData.append('query', params.queryText);
  }

  if (params.manualUrl) {
    formData.append('manual_url', params.manualUrl);
  }

  console.log(`[API] Sending /analyze payload to: ${BASE_URL}`);
  const response = await axios.post(`${BASE_URL}/analyze`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

/**
 * Text-only RAG search.
 */
export const queryTextKB = async (queryText: string) => {
  const formData = new FormData();
  formData.append('query', queryText);

  const response = await axios.post(`${BASE_URL}/query`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

/**
 * Fetch past inspections.
 */
export const fetchHistory = async () => {
  const response = await axios.get(`${BASE_URL}/history`);
  return response.data;
};

/**
 * Submit repair feedback.
 */
export const submitFeedback = async (params: {
  session_id: string;
  was_successful: boolean;
  user_rating?: number;
  repair_duration?: number;
}) => {
  const response = await axios.post(`${BASE_URL}/feedback`, params);
  return response.data;
};

/**
 * Generate alternative solution for a session.
 */
export const generateAlternativeSolution = async (params: {
  session_id: string;
  query?: string;
}) => {
  const response = await axios.post(`${BASE_URL}/generate-solution`, params);
  return response.data;
};

/**
 * Fetch local/Edge Ollama configuration.
 */
export const getOllamaConfig = async () => {
  const response = await axios.get(`${BASE_URL}/config`);
  return response.data;
};

/**
 * Update local/Edge Ollama configuration.
 */
export const updateOllamaConfig = async (params: {
  ollama_base_url?: string;
  ollama_model?: string;
}) => {
  const response = await axios.post(`${BASE_URL}/config`, params);
  return response.data;
};

/**
 * Chat Message interface representing role ('user' | 'model') and content.
 */
export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

/**
 * Query conversational chat RAG endpoint.
 */
export const queryChat = async (message: string, history: ChatMessage[]) => {
  const response = await axios.post(`${BASE_URL}/chat`, {
    message,
    history
  });
  return response.data;
};

/**
 * Ingest custom manual using text pasting.
 */
export const uploadManualText = async (params: {
  product_name: string;
  manufacturer: string;
  model_number: string;
  manual_text: string;
  description?: string;
  category?: string;
}) => {
  console.log(`[API] Ingesting manual text for ${params.model_number} to: ${BASE_URL}`);
  const response = await axios.post(`${BASE_URL}/admin/add-manual-text`, params);
  return response.data;
};

/**
 * Ingest custom manual by uploading a file.
 */
export const uploadManualFile = async (
  fileUri: string,
  metadata: {
    product_name: string;
    manufacturer: string;
    model_number: string;
    description?: string;
  },
  category: string = 'manuals'
) => {
  const formData = new FormData();
  const filename = fileUri.split('/').pop() || 'manual.txt';
  
  if (Platform.OS === 'web') {
    const res = await fetch(fileUri);
    const blob = await res.blob();
    formData.append('file', blob, filename);
  } else {
    formData.append('file', {
      uri: fileUri,
      name: filename,
      type: 'text/plain'
    } as any);
  }

  formData.append('category', category);
  formData.append('product_name', metadata.product_name);
  formData.append('manufacturer', metadata.manufacturer);
  formData.append('model_number', metadata.model_number);
  if (metadata.description) {
    formData.append('description', metadata.description);
  }

  console.log(`[API] Uploading manual file ${filename} to: ${BASE_URL}`);
  const response = await axios.post(`${BASE_URL}/admin/upload-manual`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

/**
 * Ingest custom manual by downloading from a URL.
 */
export const uploadManualUrl = async (params: {
  product_name: string;
  manufacturer: string;
  model_number: string;
  url: string;
  description?: string;
  category?: string;
}) => {
  console.log(`[API] Crawling manual URL ${params.url} to: ${BASE_URL}`);
  const response = await axios.post(`${BASE_URL}/admin/add-manual-url`, params);
  return response.data;
};


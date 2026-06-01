import sqlite3

conn = sqlite3.connect("technician_assistant.db")
cursor = conn.cursor()
cursor.execute("SELECT text FROM document_chunks WHERE source_file = 'hvac_compressor_manual.txt'")
for row in cursor.fetchall():
    print("CHUNK:")
    print(row[0])
    print("-" * 50)

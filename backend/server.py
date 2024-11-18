import os
from pathlib import Path
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS
import PyPDF2
import requests
from io import BytesIO
import traceback
from docling.document_converter import DocumentConverter

app = Flask(__name__)
CORS(app)


@app.route('/pdf2markdown', methods=['POST'])
def pdf2markdown():
    """
    APIエンドポイント: リクエストからPDFを取得し、テキストを抽出して返す。
    """
    pdf_stream = None

    # データ取得フェーズ
    try:
        if 'file' in request.files:
            # PDFファイルがアップロードされた場合
            pdf_file = request.files['file']
            pdf_stream = pdf_file.stream
        elif 'url' in request.json:
            # URLが提供された場合
            pdf_url = request.json['url']
            response = requests.get(pdf_url)
            response.raise_for_status()
            pdf_stream = BytesIO(response.content)
        else:
            raise ValueError("No valid PDF file or URL provided")
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f"Failed to fetch PDF from URL: {str(e)}"}), 400
    except Exception as e:
        return jsonify({'error': f"Unexpected error during data retrieval: {str(e)}"}), 500

    # データ変換フェーズ
    try:
        text = extract_text_from_pdf(pdf_stream)
        return jsonify({'text': text})
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(error_traceback)
        return jsonify({'error': f"Error extracting text from PDF: {str(e)}"}), 500


def extract_text_from_pdf(pdf_stream):
    """
    PDFストリームからテキストを抽出する。
    """
    # reader = PyPDF2.PdfReader(pdf_stream)
    # text = ''
    # for page in reader.pages:
    #     text += page.extract_text()
    # return text.strip()

    print("★:", type(pdf_stream))

    # tempfile.SpooledTemporaryFile から一時ファイルを保存して Path に変換
    with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
        tmp_file.write(pdf_stream.read())  # PDFストリームの内容を一時ファイルに書き込む
        tmp_file_path = Path(tmp_file.name)

    converter = DocumentConverter()
    result = converter.convert(tmp_file_path)
    md_text = result.document.export_to_markdown()

    return md_text



if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5601, debug=True)
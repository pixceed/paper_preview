import argparse
import glob
import os
import json
import time
from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context, send_file
from flask_cors import CORS
import requests
from io import BytesIO
import traceback
from datetime import datetime
from dotenv import load_dotenv
import zipfile

import sqlite3

# ChatOpenAI と AzureChatOpenAI
from langchain_openai import ChatOpenAI, AzureChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_community.callbacks.manager import get_openai_callback

from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph
from langgraph.graph.message import add_messages
from langchain_core.prompts import PromptTemplate

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    TableFormerMode,
)
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc import PictureItem, TableItem

# .envファイルから環境変数を読み込み
load_dotenv()

app = Flask(__name__)
CORS(app)

# --- ここで Flask のグローバルな config に CHAT_MODEL 用のキーを用意しておく ---
app.config["CHAT_MODEL"] = None

########################################################################
# ① CONTENT_DATA_DIR を /home/ubuntu/workspace/users に変更
#    (ユーザー別ディレクトリ管理)
########################################################################
CONTENT_DATA_DIR = "/home/ubuntu/workspace/users"
os.makedirs(CONTENT_DATA_DIR, exist_ok=True)

########################################################################
# ② ユーザーごとに chat_history.db を作るためのヘルパー
########################################################################
def get_user_dir(username: str):
    """
    ユーザー固有のディレクトリを返す
    """
    return os.path.join(CONTENT_DATA_DIR, username)

def get_user_db_path(username: str):
    """
    ユーザー固有のchat_history.dbのパスを返す
    """
    return os.path.join(get_user_dir(username), 'chat_history.db')

def ensure_user_db_exists(username: str):
    """
    指定ユーザーのDBがなければ作成、必要なテーブルを初期化
    """
    user_dir = get_user_dir(username)
    os.makedirs(user_dir, exist_ok=True)

    db_path = get_user_db_path(username)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dir_name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now','+9 hours'))
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(session_id) REFERENCES chat_sessions(id)
        )
    ''')
    conn.commit()
    conn.close()

########################################################################
# ③ ユーザー新規/既存を確認するエンドポイント
########################################################################
# 許可されたユーザーリストを読み込む関数を追加
def load_allowed_users():
    allowed_users = set()
    try:
        with open('allowed_users.txt', 'r') as f:
            for line in f:
                username = line.strip()
                if username:  # 空行をスキップ
                    allowed_users.add(username)
    except FileNotFoundError:
        print("Warning: allowed_users.txt not found")
        return set()
    return allowed_users

# check_user エンドポイントを修正
@app.route('/check_user', methods=['GET'])
def check_user():
    username = request.args.get('username')
    if not username:
        return jsonify({"error": "username is required"}), 400

    # 不正文字除去例
    if '..' in username or '/' in username or '\\' in username:
        return jsonify({'error': 'Invalid username.'}), 400

    # 許可されたユーザーリストをチェック
    allowed_users = load_allowed_users()
    if username not in allowed_users:
        return jsonify({"error": "Unauthorized user"}), 403

    user_dir = get_user_dir(username)
    if os.path.exists(user_dir):
        # 既存ユーザー
        return jsonify({"exists": True}), 200
    else:
        # 未登録ユーザー
        return jsonify({"exists": False}), 200

# create_user エンドポイントも修正
@app.route('/create_user', methods=['POST'])
def create_user():
    data = request.get_json()
    if not data or 'username' not in data:
        return jsonify({'error': 'username is required'}), 400

    username = data['username']
    if '..' in username or '/' in username or '\\' in username:
        return jsonify({'error': 'Invalid username.'}), 400

    # 許可されたユーザーリストをチェック
    allowed_users = load_allowed_users()
    if username not in allowed_users:
        return jsonify({"error": "Unauthorized user"}), 403

    user_dir = get_user_dir(username)
    if os.path.exists(user_dir):
        return jsonify({"message": "User already exists."}), 200
    else:
        os.makedirs(user_dir, exist_ok=True)
        # DB初期化
        ensure_user_db_exists(username)
        return jsonify({"message": "User created."}), 200

########################################################################
# チャットセッション系のテーブル操作
########################################################################
def remove_oldest_session_if_needed(db_cursor, dir_name):
    """
    指定ディレクトリのセッションが30件を超えた場合は最古のセッションを削除。
    """
    db_cursor.execute('''
        SELECT id FROM chat_sessions
        WHERE dir_name = ?
        ORDER BY created_at ASC
    ''', (dir_name,))
    sessions = db_cursor.fetchall()
    if len(sessions) > 30:
        oldest_id = sessions[0][0]
        db_cursor.execute('DELETE FROM chat_messages WHERE session_id = ?', (oldest_id,))
        db_cursor.execute('DELETE FROM chat_sessions WHERE id = ?', (oldest_id,))

@app.route('/create_chat_session', methods=['POST'])
def create_chat_session():
    """
    新しいチャットセッションを作成。dir_name, username が必須。
    """
    username = request.args.get('username', None)
    dir_name = request.args.get('dir_name', None)
    if not username or not dir_name:
        return jsonify({'error': 'username and dir_name are required'}), 400

    # ユーザーDB用意
    ensure_user_db_exists(username)
    db_path = get_user_db_path(username)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    cursor = conn.cursor()

    remove_oldest_session_if_needed(cursor, dir_name)

    cursor.execute(
        'INSERT INTO chat_sessions (dir_name) VALUES (?)',
        (dir_name,)
    )
    new_session_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({'session_id': new_session_id}), 200

@app.route('/list_chat_sessions', methods=['GET'])
def list_chat_sessions():
    """
    指定された dir_name のチャットセッション一覧を新しい順に返す。
    """
    username = request.args.get('username', None)
    dir_name = request.args.get('dir_name', None)
    if not username or not dir_name:
        return jsonify({'error': 'username and dir_name are required'}), 400

    ensure_user_db_exists(username)
    db_path = get_user_db_path(username)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, created_at
        FROM chat_sessions
        WHERE dir_name = ?
        ORDER BY created_at DESC
    ''', (dir_name,))
    rows = cursor.fetchall()
    conn.close()

    sessions = []
    for r in rows:
        sessions.append({
            'id': r[0],
            'created_at': str(r[1])
        })

    return jsonify({'sessions': sessions}), 200

@app.route('/get_chat_history', methods=['GET'])
def get_chat_history():
    """
    セッションIDを指定し、DBに保存されたメッセージを取得。
    """
    username = request.args.get('username', None)
    session_id = request.args.get('session_id', None)
    if not username or not session_id:
        return jsonify({'error': 'username and session_id are required'}), 400

    ensure_user_db_exists(username)
    db_path = get_user_db_path(username)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    cursor = conn.cursor()

    cursor.execute('''
        SELECT role, content
        FROM chat_messages
        WHERE session_id = ?
        ORDER BY id ASC
    ''', (session_id,))
    rows = cursor.fetchall()
    conn.close()

    all_messages = []
    for (role, raw_content) in rows:
        try:
            data = json.loads(raw_content)  # JSONパース
            if isinstance(data, list):
                for item in data:
                    if item.get("type") == "text":
                        all_messages.append({
                            "role": role,
                            "type": "text",
                            "content": item.get("text", "")
                        })
                    elif item.get("type") == "image_url":
                        all_messages.append({
                            "role": role,
                            "type": "image",
                            "content": item["image_url"]["url"]
                        })
            else:
                all_messages.append({
                    "role": role,
                    "type": "text",
                    "content": str(data)
                })
        except:
            all_messages.append({
                "role": role,
                "type": "text",
                "content": raw_content
            })

    return jsonify({'messages': all_messages}), 200

@app.route('/delete_chat_session', methods=['POST'])
def delete_chat_session():
    data = request.get_json()
    if not data or 'session_id' not in data or 'username' not in data:
        return jsonify({'error': 'session_id and username are required'}), 400

    session_id = data['session_id']
    username = data['username']

    ensure_user_db_exists(username)
    db_path = get_user_db_path(username)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    cursor = conn.cursor()

    cursor.execute('DELETE FROM chat_messages WHERE session_id = ?', (session_id,))
    cursor.execute('DELETE FROM chat_sessions WHERE id = ?', (session_id,))
    conn.commit()
    conn.close()

    return jsonify({'message': f'Session {session_id} deleted.'}), 200

@app.route('/bulk_save_chat', methods=['POST'])
def bulk_save_chat():
    """
    旧セッションのチャット履歴を新セッションにまとめて保存し直すためのエンドポイント
    """
    data = request.get_json()
    session_id = data.get('session_id')
    messages = data.get('messages', [])
    username = data.get('username')

    if not session_id or not username:
        return jsonify({'error': 'session_id and username are required'}), 400
    if not isinstance(messages, list) or len(messages) == 0:
        return jsonify({'error': 'No messages to save or invalid format'}), 400

    ensure_user_db_exists(username)
    db_path = get_user_db_path(username)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    cursor = conn.cursor()

    for m in messages:
        role = m.get('role')
        content = m.get('content')
        if role and content:
            cursor.execute('''
                INSERT INTO chat_messages (session_id, role, content)
                VALUES (?, ?, ?)
            ''', (session_id, role, content))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Bulk save complete'}), 200

def save_chat_message(username, session_id, role, content):
    """
    1件のメッセージをDBに保存。
    content は JSON文字列でも、プレーンテキストでもよい。
    """
    ensure_user_db_exists(username)
    db_path = get_user_db_path(username)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO chat_messages (session_id, role, content)
        VALUES (?, ?, ?)
    ''', (session_id, role, content))
    conn.commit()
    conn.close()

########################################################################
# コンテンツファイル閲覧
########################################################################
@app.route('/contents/<path:filename>', methods=['GET'])
def serve_content_files(filename):
    """
    contents ディレクトリからファイルを提供するエンドポイント。
    ただし今回は /home/ubuntu/workspace/users/<username>/... を想定。
    filename が "username/dir_name/xxx.pdf" などの形を許容。
    """
    try:
        # 安全なパス判定
        safe_path = os.path.join(CONTENT_DATA_DIR, filename)
        if not os.path.abspath(safe_path).startswith(os.path.abspath(CONTENT_DATA_DIR)):
            return jsonify({'error': 'Invalid file path'}), 400
        return send_from_directory(CONTENT_DATA_DIR, filename)
    except FileNotFoundError:
        return jsonify({'error': 'File not found'}), 404

@app.route('/list_files/<path:dir_name>', methods=['GET'])
def list_files(dir_name):
    """
    指定ディレクトリ内のPDFとMarkdownを返す。
    例: dir_name = "alice/20230701010101_myPaper"
    """
    try:
        dir_path = os.path.join(CONTENT_DATA_DIR, dir_name)
        if not os.path.isdir(dir_path):
            return jsonify({'error': 'Directory not found'}), 404
        files = os.listdir(dir_path)
        markdown_files = [f for f in files if f.lower().endswith('.md')]
        pdf_files = [f for f in files if f.lower().endswith('.pdf')]

        if len(pdf_files) != 1:
            return jsonify({'error': 'ディレクトリ内にPDFファイルが1つではありません'}), 400

        return jsonify({
            'markdown_files': markdown_files,
            'pdf_file': pdf_files[0]
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/list_contents', methods=['GET'])
def list_contents():
    """
    username ディレクトリ直下にあるサブディレクトリ一覧を返す。
    新しい順（更新時刻が新しい順）にソート。
    """
    username = request.args.get('username')
    if not username:
        return jsonify({'error': 'username is required'}), 400

    if '..' in username or '/' in username or '\\' in username:
        return jsonify({'error': 'Invalid username.'}), 400

    # ユーザーのルートディレクトリ
    user_dir = os.path.join(CONTENT_DATA_DIR, username)
    if not os.path.isdir(user_dir):
        return jsonify({'error': f'User directory not found: {username}'}), 404

    try:
        # username ディレクトリ直下のサブディレクトリ一覧を取得
        dir_paths = [
            os.path.join(user_dir, d)
            for d in os.listdir(user_dir)
            if os.path.isdir(os.path.join(user_dir, d))
        ]
        # 更新時刻が新しい順にソート
        dir_paths_sorted = sorted(dir_paths, key=os.path.getmtime, reverse=True)

        directories = []
        for dir_path in dir_paths_sorted:
            d = os.path.basename(dir_path)
            # 必要に応じて表示名の加工を行う (例: timestamp_XXXX → XXXX)
            parts = d.split('_', 1)
            if len(parts) == 2:
                display_name = parts[1]
            else:
                display_name = d

            directories.append({
                'dir_name': d,
                'display_name': display_name
            })

        return jsonify({'directories': directories}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

########################################################################
# PDFアップロードまたはURL読み込み → マークダウン化
########################################################################
@app.route('/pdf2markdown', methods=['POST'])
def pdf2markdown():
    """
    PDFファイルを受け取り（またはURL）、Markdownへ変換。
    SSE (Server-Sent Events)で進捗を返す。
    """
    username = request.args.get('username')
    if not username:
        return jsonify({"error": "username is required"}), 400

    @stream_with_context
    def generate():
        pdf_stream = None
        file_name = ""
        try:
            if 'file' in request.files:
                pdf_file = request.files['file']
                file_name = pdf_file.filename
                pdf_stream = pdf_file.stream
            elif request.is_json and 'url' in request.json:
                pdf_url = request.json['url']
                file_name = os.path.basename(pdf_url)
                if not file_name.lower().endswith('.pdf'):
                    file_name += '.pdf'
                response = requests.get(pdf_url)
                response.raise_for_status()
                pdf_stream = BytesIO(response.content)
            else:
                raise ValueError("No valid PDF file or URL provided")
        except Exception as e:
            yield f'data: {json.dumps({"error": str(e)})}\n\n'
            return

        # PDF -> Markdown (SSE)
        try:
            for message in extract_text_from_pdf(pdf_stream, file_name, username):
                yield f'data: {message}\n\n'
        except Exception as e:
            traceback.print_exc()
            yield f'data: {json.dumps({"error": f"Error extracting text: {str(e)}"})}\n\n'

    return Response(generate(), mimetype='text/event-stream')

def extract_text_from_pdf(pdf_stream, file_name, username):
    """
    PDFを解析し、Markdownに変換（+ 画像を保存）する処理。
    SSE進捗を返すため、ジェネレータを使う。
    """
    base_name = os.path.splitext(file_name)[0]
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    dir_name = f"{timestamp}_{base_name}"

    user_dir = os.path.join(CONTENT_DATA_DIR, username)
    os.makedirs(user_dir, exist_ok=True)

    output_dir = os.path.join(user_dir, dir_name)
    os.makedirs(output_dir, exist_ok=True)

    yield json.dumps({"status": "PDFファイルの保存中..."})

    pdf_file_path = os.path.join(output_dir, file_name)
    with open(pdf_file_path, mode="wb") as f:
        f.write(pdf_stream.read())

    yield json.dumps({"status": "PDFファイルの解析中..."})
    IMAGE_RESOLUTION_SCALE = 2.0
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = False
    pipeline_options.do_table_structure = False
    pipeline_options.table_structure_options.do_cell_matching = False
    pipeline_options.table_structure_options.mode = TableFormerMode.ACCURATE
    pipeline_options.images_scale = IMAGE_RESOLUTION_SCALE
    pipeline_options.generate_page_images = False
    pipeline_options.generate_table_images = True
    pipeline_options.generate_picture_images = True

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )
    conv_res = converter.convert(pdf_file_path)

    yield json.dumps({"status": "画像保存中..."})
    table_counter = 0
    picture_counter = 0
    for element, _level in conv_res.document.iterate_items():
        if isinstance(element, TableItem):
            table_counter += 1
            element_image_filename = os.path.join(output_dir, f"table-{table_counter}.png")
            with open(element_image_filename, "wb") as fp:
                element.image.pil_image.save(fp, "PNG")

        if isinstance(element, PictureItem):
            picture_counter += 1
            element_image_filename = os.path.join(output_dir, f"picture-{picture_counter}.png")
            with open(element_image_filename, "wb") as fp:
                element.image.pil_image.save(fp, "PNG")

    yield json.dumps({"status": "マークダウン変換中..."})
    md_text = conv_res.document.export_to_markdown()

    yield json.dumps({"llm_output": "$=~=$start$=~=$"})
    result_text = ""

    with get_openai_callback() as cb:
        chat_model = app.config["CHAT_MODEL"]
        chat_model.temperature = 0
        chat_model.streaming = True

        system_prompt = SystemMessage(
            content=
            """
            与えられたマークダウン文章に以下の処理を行い、追記後のマークダウン文章を出力してください。

            ・文章中における図の部分に、`![Local Image](picture-$.png)\n`($は図番号)を追記してください。
            ・文章中における表の部分に、`![Local Image](table-$.png)\n`($は表番号)を追記してください。

            出力は、必ずマークダウン文章のみで、余計な文章は含めないでください。
            """
        )
        image_message = HumanMessage(content=md_text)
        messages = [system_prompt, image_message]

        for result in chat_model.stream(messages):
            result_text += result.content
            if result == '':
                continue
            yield json.dumps({"llm_output": result.content})

        print(f"\nTotal Tokens: {cb.total_tokens}")
        print(f"Prompt Tokens: {cb.prompt_tokens}")
        print(f"Completion Tokens: {cb.completion_tokens}")
        print(f"Total Cost (USD): ${cb.total_cost}\n")

    result_text = result_text.replace("```markdown", "").replace("```", "")

    md_filename = os.path.join(output_dir, f"{base_name}_origin.md")
    with open(md_filename, mode="w", encoding="utf-8") as f:
        f.write(result_text)

    yield json.dumps({"llm_output": "$=~=$end$=~=$"})
    yield json.dumps({"dir_name": f"{username}/{dir_name}", "base_file_name": base_name})

########################################################################
# 日本語翻訳
########################################################################
@app.route('/trans_markdown', methods=['POST'])
def trans_markdown():
    @stream_with_context
    def generate():
        try:
            data = request.get_json()
            dir_name = data.get('dir_name')
            if not dir_name:
                yield f'data: {json.dumps({"error": "dir_name is required"})}\n\n'
                return

            dir_path = os.path.join(CONTENT_DATA_DIR, dir_name)
            if not os.path.isdir(dir_path):
                yield f'data: {json.dumps({"error": "Directory not found"})}\n\n'
                return

            files = os.listdir(dir_path)
            origin_md_files = [f for f in files if f.lower().endswith('_origin.md')]
            if not origin_md_files:
                yield f'data: {json.dumps({"error": "Origin markdown file not found"})}\n\n'
                return

            origin_md_file = origin_md_files[0]
            origin_md_path = os.path.join(dir_path, origin_md_file)
            base_name = os.path.splitext(origin_md_file)[0].replace('_origin', '')

            with open(origin_md_path, 'r', encoding='utf-8') as f:
                md_text = f.read()

            yield f'data: {json.dumps({"status": "日本語に変換中..."})}\n\n'
            yield f'data: {json.dumps({"llm_output": "$=~=$start$=~=$"})}\n\n'
            result_text = ""

            with get_openai_callback() as cb:
                chat_model = app.config["CHAT_MODEL"]
                chat_model.temperature = 0
                chat_model.streaming = True

                system_prompt = SystemMessage(
                    content=
                    """
                    以下のマークダウン文書を日本語に翻訳してください。
                    コードブロックやマークダウンの書式はそのままにしてください。
                    見出し部分は、翻訳せず原文そのままとしてください。

                    出力は、必ずマークダウン文章のみで、余計な文章は含めないでください。
                    """
                )
                translate_message = HumanMessage(content=md_text)
                messages = [system_prompt, translate_message]

                for result in chat_model.stream(messages):
                    result_text += result.content
                    if result == '':
                        continue
                    yield f'data: {json.dumps({"llm_output": result.content})}\n\n'

                print(f"\nTotal Tokens: {cb.total_tokens}")
                print(f"Prompt Tokens: {cb.prompt_tokens}")
                print(f"Completion Tokens: {cb.completion_tokens}")
                print(f"Total Cost (USD): ${cb.total_cost}\n")

            ja_md_filename = os.path.join(dir_path, f"{base_name}_trans.md")
            with open(ja_md_filename, mode="w", encoding="utf-8") as f:
                f.write(result_text)

            yield f'data: {json.dumps({"llm_output": "$=~=$end$=~=$"})}\n\n'
            yield f'data: {json.dumps({"status": "変換完了しました", "base_file_name": base_name})}\n\n'
        except Exception as e:
            error_traceback = traceback.format_exc()
            print(error_traceback)
            yield f'data: {json.dumps({"error": f"Error during translation: {str(e)}"})}\n\n'
            return

    return Response(generate(), mimetype='text/event-stream')

########################################################################
# マークダウン保存
########################################################################
@app.route('/save_markdown', methods=['POST'])
def save_markdown():
    try:
        data = request.get_json()
        dir_name = data.get('dir_name')
        file_name = data.get('file_name')
        content = data.get('content')

        if not dir_name or not file_name or content is None:
            return jsonify({'error': 'dir_name, file_name, and content are required.'}), 400

        # '/' は許容するが '..' と '\\' は禁止 (上位ディレクトリやバックスラッシュ)
        if '..' in dir_name or '\\' in dir_name:
            return jsonify({'error': 'Invalid directory name.'}), 400
        if '..' in file_name or '\\' in file_name:
            return jsonify({'error': 'Invalid file name.'}), 400

        if not file_name.lower().endswith('.md'):
            return jsonify({'error': 'Invalid file name. Must end with .md'}), 400

        target_dir = os.path.join(CONTENT_DATA_DIR, dir_name)
        if not os.path.isdir(target_dir):
            return jsonify({'error': 'Directory not found.'}), 404

        target_file_path = os.path.join(target_dir, file_name)
        with open(target_file_path, 'w', encoding='utf-8') as f:
            f.write(content)

        return jsonify({'message': 'File saved successfully.'}), 200
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(error_traceback)
        return jsonify({'error': f'Error saving file: {str(e)}'}), 500

########################################################################
# 新規: 指定ファイルの削除 (例: _trans.md, _explain.md, _thread.md)
########################################################################
@app.route('/delete_file', methods=['POST'])
def delete_file():
    """
    指定のディレクトリ内から、特定のサフィックスを持つファイルを探して削除する
    例: suffix = "_trans.md", "_explain.md", "_thread.md"
    """
    try:
        data = request.get_json()
        dir_name = data.get('dir_name')
        username = data.get('username')
        suffix = data.get('suffix')
        if not dir_name or not username or not suffix:
            return jsonify({'error': 'dir_name, username, suffix are required.'}), 400

        if '..' in dir_name or '\\' in dir_name:
            return jsonify({'error': 'Invalid directory name.'}), 400

        target_dir = os.path.join(CONTENT_DATA_DIR, username, dir_name)
        if not os.path.isdir(target_dir):
            return jsonify({'error': 'Directory not found.'}), 404

        # ディレクトリ内から suffix にマッチするファイルを探す
        found_file = None
        for f in os.listdir(target_dir):
            if f.lower().endswith(suffix.lower()):
                found_file = os.path.join(target_dir, f)
                break

        if found_file and os.path.isfile(found_file):
            os.remove(found_file)
            return jsonify({'message': f'File "{os.path.basename(found_file)}" has been deleted.'}), 200
        else:
            return jsonify({'error': 'No matching file found to delete'}), 404

    except Exception as e:
        error_traceback = traceback.format_exc()
        print(error_traceback)
        return jsonify({'error': f'Error deleting file: {str(e)}'}), 500

########################################################################
# ディレクトリ削除
########################################################################
@app.route('/delete_directory', methods=['POST'])
def delete_directory():
    """
    指定ディレクトリごと削除 (username/subdir も可)。
    """
    try:
        data = request.get_json()
        dir_name = data.get('dir_name')
        username = data.get('username')
        if not dir_name:
            return jsonify({'error': 'dir_name is required.'}), 400

        # '/'は許可、'..'と'\\'は禁止に修正
        if '..' in dir_name or '\\' in dir_name:
            return jsonify({'error': 'Invalid directory name.'}), 400

        target_dir = os.path.join(CONTENT_DATA_DIR, username, dir_name)
        if not os.path.isdir(target_dir):
            return jsonify({'error': 'Directory not found.'}), 404

        import shutil
        shutil.rmtree(target_dir)
        return jsonify({'message': f'Directory "{dir_name}" has been deleted successfully.'}), 200
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(error_traceback)
        return jsonify({'error': f'Error deleting directory: {str(e)}'}), 500

########################################################################
# 初期状態化
########################################################################
@app.route('/initialize_state', methods=['GET'])
def initialize_state():
    input_dir_param = request.args.get('input_dir')
    if not input_dir_param:
        return jsonify({"error": "input_dir パラメータが必要です。"}), 400

    # '/' を許容し、 '..' や '\\' を禁止
    if '..' in input_dir_param or '\\' in input_dir_param:
        return jsonify({'error': 'Invalid directory name.'}), 400

    input_dir = os.path.join(CONTENT_DATA_DIR, input_dir_param)
    if not os.path.isdir(input_dir):
        return jsonify({"error": f"指定されたディレクトリが存在しません: {input_dir_param}"}), 400

    md_files = [f for f in os.listdir(input_dir) if f.endswith('_origin.md')]
    if not md_files:
        return jsonify({"error": "ディレクトリ内に_origin.mdファイルが存在しません。"}), 400

    md_path = os.path.join(input_dir, md_files[0])
    with open(md_path, mode="r", encoding="utf-8") as f:
        md_text = f.read()

    png_files = []
    for root, dirs, files in os.walk(input_dir):
        for file in files:
            if (file.startswith('table') or file.startswith('picture')) and file.endswith('.png'):
                png_files.append(os.path.join(root, file))

    state = {"messages": []}
    system_prompt = """
あなたは、論文解説のスペシャリストです。
以下の論文内容を理解し、ユーザーからの質問に分かりやすく回答してください。
"""
    system_message = {
        "role": "system",
        "content": system_prompt
    }
    state["messages"].append(system_message)

    prompt_template = PromptTemplate(
        input_variables=["paper_content"],
        template="""
以下の論文内容について、教えてください。

<論文内容>
{paper_content}
</論文内容>
""",
    )

    user_prompt = prompt_template.invoke({
        "paper_content": md_text
    })
    user_prompt_text = user_prompt.text

    image_info = "\n\n<図の詳細>"
    for i, png_file in enumerate(png_files):
        png_file_name = os.path.basename(png_file)
        image_info += f"\n{i+1}つ目の画像は、{png_file_name}です。"
    image_info += "\n</図の詳細>"

    user_prompt_text += image_info

    user_message = {
        "role": "user",
        "content": user_prompt_text
    }
    state["messages"].append(user_message)

    assistant_prompt = "論文内容を理解しました。質問をどうぞ。"
    state["messages"].append(
        {"role": "assistant", "content": assistant_prompt},
    )

    return jsonify(state)

########################################################################
# LangGraphエージェント構築
########################################################################
class State(TypedDict):
    messages: Annotated[list, add_messages]

def initialize_agent():
    graph_builder = StateGraph(State)

    def chatbot(state: State):
        with get_openai_callback() as cb:
            chat_model = app.config["CHAT_MODEL"]
            chat_model.temperature = 1
            chat_model.streaming = False

            answer = {"messages": [chat_model.invoke(state["messages"])]}

            print(f"\nTotal Tokens: {cb.total_tokens}")
            print(f"Prompt Tokens: {cb.prompt_tokens}")
            print(f"Completion Tokens: {cb.completion_tokens}")
            print(f"Total Cost (USD): ${cb.total_cost}\n")

            return answer

    graph_builder.add_node("chatbot", chatbot)
    graph_builder.set_entry_point("chatbot")
    agent = graph_builder.compile()
    return agent

########################################################################
# scholar_agent (チャット問い合わせ)
########################################################################
@app.route('/scholar_agent', methods=['POST'])
def scholar_agent():
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSONペイロードが必要です。"}), 400

    state = data.get('state')
    user_input = data.get('user_input')
    session_id = data.get('session_id')
    username = data.get('username')

    if not username:
        return jsonify({"error": "username が必要です。"}), 400
    if not state:
        return jsonify({"error": "state が必要です。"}), 400
    if not user_input:
        return jsonify({"error": "user_input が必要です。"}), 400
    if not session_id:
        return jsonify({"error": "session_id が必要です。"}), 400

    try:
        # 1) DBに保存
        save_chat_message(username, session_id, 'user', user_input)

        # 2) LLMに入力するため user_input(JSON)を文字列化
        user_str_for_llm = ""
        try:
            parsed_list = json.loads(user_input)
            if isinstance(parsed_list, list):
                for item in parsed_list:
                    if item.get("type") == "text":
                        user_str_for_llm += f"ユーザーのメッセージ: {item.get('text','')}\n"
                    elif item.get("type") == "image_url":
                        image_url = item.get("image_url", {}).get("url", "")
            else:
                user_str_for_llm += f"ユーザーのメッセージ(配列でない): {json.dumps(parsed_list, ensure_ascii=False)}\n"
        except:
            user_str_for_llm = f"ユーザーのメッセージ: {user_input}"

        # 3) ステートにユーザーメッセージを追加
        if 'image_url' in locals():
            user_message = {
                "role": "user",
                # "content": user_str_for_llm
                "content": [
                    {"type": "text", "text": user_str_for_llm},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_url if 'image_url' in locals() else None
                        }
                    }
                ]
            }

        else:
            user_message = {
                "role": "user",
                "content": user_str_for_llm
            }

        state["messages"].append(user_message)

        # 4) エージェント呼び出し
        agent = initialize_agent()
        response = None
        with get_openai_callback() as cb:
            for event in agent.stream(state):
                for value in event.values():
                    response = value["messages"][-1].content
                    state["messages"].append({"role": "assistant", "content": response})

        # 5) アシスタント応答をDBに保存
        save_chat_message(username, session_id, 'assistant', response)

        response_data = {
            "response": response,
            "state": state
        }
        return jsonify(response_data)
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        traceback_str = traceback.format_exc()
        print(traceback_str)
        return jsonify({"error": f"内部エラーが発生しました: {str(e)}"}), 500

########################################################################
# ディレクトリダウンロード (Zip)
########################################################################
@app.route('/download_directory', methods=['GET'])
def download_directory():
    """
    指定ディレクトリをzipファイルとしてダウンロード (username/subdirも可)。
    """
    try:
        username = request.args.get('username')
        if not username:
            return jsonify({'error': 'username is required'}), 400

        if '..' in username or '/' in username or '\\' in username:
            return jsonify({'error': 'Invalid username.'}), 400

        # ユーザーのルートディレクトリ
        user_dir = os.path.join(CONTENT_DATA_DIR, username)
        if not os.path.isdir(user_dir):
            return jsonify({'error': f'User directory not found: {username}'}), 404

        dir_name = request.args.get('dir_name')
        if not dir_name:
            return jsonify({'error': 'dir_name is required.'}), 400

        # '/' を許容、'..' と '\\' を禁止にする
        if '..' in dir_name or '\\' in dir_name:
            return jsonify({'error': 'Invalid directory name.'}), 400

        target_dir = os.path.join(user_dir, dir_name)
        if not os.path.isdir(target_dir):
            return jsonify({'error': 'Directory not found.'}), 404

        memory_file = BytesIO()
        with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(target_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, target_dir)
                    zf.write(file_path, arcname)

        memory_file.seek(0)
        return send_file(
            memory_file,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'{dir_name}.zip'
        )

    except Exception as e:
        error_traceback = traceback.format_exc()
        print(error_traceback)
        return jsonify({'error': f'Error creating zip file: {str(e)}'}), 500

########################################################################
# 論文解説 _explain.md 生成
########################################################################
@app.route('/explain_paper', methods=['POST'])
def explain_paper():
    @stream_with_context
    def generate():
        try:
            data = request.get_json()
            dir_name = data.get('dir_name')
            if not dir_name:
                yield f'data: {json.dumps({"error": "dir_name is required"})}\n\n'
                return

            dir_path = os.path.join(CONTENT_DATA_DIR, dir_name)
            if not os.path.isdir(dir_path):
                yield f'data: {json.dumps({"error": "Directory not found"})}\n\n'
                return

            files = os.listdir(dir_path)
            origin_md_files = [f for f in files if f.lower().endswith('_origin.md')]
            if not origin_md_files:
                yield f'data: {json.dumps({"error": "Origin markdown file not found"})}\n\n'
                return

            origin_md_path = os.path.join(dir_path, origin_md_files[0])
            base_name = os.path.splitext(origin_md_files[0])[0].replace('_origin', '')

            with open(origin_md_path, 'r', encoding='utf-8') as f:
                md_text = f.read()

            yield f'data: {json.dumps({"status": "論文を解説中..."})}\n\n'
            yield f'data: {json.dumps({"llm_output": "$=~=$start$=~=$"})}\n\n'
            result_text = ""

            with get_openai_callback() as cb:
                chat_model = app.config["CHAT_MODEL"]
                chat_model.temperature = 0
                chat_model.streaming = True

                system_prompt = SystemMessage(
                    content=
"""
この論文を読みたいです。以下の制約を守り、要約をお願いします。
目的：論文の概要から詳細をつかみ、この論文をより詳しく読むべきか判断したい
対象読者：深層学習の基礎は知っている大学生
構成は、以下の例に従い、要約を生成するときは全ての内容を網羅した上で、この論文を理解するのに必要だと判断した部分を扱ってください。もし論文に書かれていないのであれば、「論文には書かれていませんでした」と出力すること。
全ては論文に書かれていることのみを使うこと。ハルシネーションは禁止です。
直訳ではなく、AIの文脈を考慮して文章を生成すること。
出力は文章をそのままではなく、マークダウンにして流れや構成要素をわかりやすくすること。
出力の長さは気にしないこと。途中で途切れても良いです。このタスクでは出力長制限よりも、私が与えたタスクを完璧にこなすことを何よりも優先すること。内容の抜け漏れは断じて許されません。

=====構成（例）=====
# abstract
日本語訳

# 解決する課題
## 既存研究の流れ（関連研究）
## この研究が解決する課題・どう解決するのか
解決する課題1
 →どう解決するか
解決する課題2
 →どう解決するか
解決する課題3
 →どう解決するか
（以下略）

# 提案手法
## 提案手法の直感的な説明
## 提案手法詳細
提案手法の構成コンポーネントや、仕組みの詳細

# 実験
## 実験設定
## 実験結果

# 考察
## なぜこの手法が優れているのか
## この手法が既存のものより優れている点・劣っている点

# 今後の発展
"""
                )
                explain_message = HumanMessage(content=md_text)
                messages = [system_prompt, explain_message]

                for result in chat_model.stream(messages):
                    result_text += result.content
                    if result == '':
                        continue
                    yield f'data: {json.dumps({"llm_output": result.content})}\n\n'

                print(f"\nTotal Tokens: {cb.total_tokens}")
                print(f"Prompt Tokens: {cb.prompt_tokens}")
                print(f"Completion Tokens: {cb.completion_tokens}")
                print(f"Total Cost (USD): ${cb.total_cost}\n")

            explain_md_filename = os.path.join(dir_path, f"{base_name}_explain.md")
            with open(explain_md_filename, mode="w", encoding="utf-8") as f:
                f.write(result_text)

            yield f'data: {json.dumps({"llm_output": "$=~=$end$=~=$"})}\n\n'
            yield f'data: {json.dumps({"status": "解説の生成が完了しました"})}\n\n'

        except Exception as e:
            error_traceback = traceback.format_exc()
            print(error_traceback)
            yield f'data: {json.dumps({"error": f"Error during explanation: {str(e)}"})}\n\n'
            return

    return Response(generate(), mimetype='text/event-stream')

########################################################################
# なんJスレ形式解説 _thread.md 生成
########################################################################
@app.route('/thread_paper', methods=['POST'])
def thread_paper():
    @stream_with_context
    def generate():
        try:
            data = request.get_json()
            dir_name = data.get('dir_name')
            if not dir_name:
                yield f'data: {json.dumps({"error": "dir_name is required"})}\n\n'
                return

            dir_path = os.path.join(CONTENT_DATA_DIR, dir_name)
            if not os.path.isdir(dir_path):
                yield f'data: {json.dumps({"error": "Directory not found"})}\n\n'
                return

            files = os.listdir(dir_path)
            origin_md_files = [f for f in files if f.lower().endswith('_origin.md')]
            if not origin_md_files:
                yield f'data: {json.dumps({"error": "Origin markdown file not found"})}\n\n'
                return

            origin_md_path = os.path.join(dir_path, origin_md_files[0])
            base_name = os.path.splitext(origin_md_files[0])[0].replace('_origin', '')

            with open(origin_md_path, 'r', encoding='utf-8') as f:
                md_text = f.read()

            yield f'data: {json.dumps({"status": "スレッド形式で解説中..."})}\n\n'
            yield f'data: {json.dumps({"llm_output": "$=~=$start$=~=$"})}\n\n'
            result_text = ""

            with get_openai_callback() as cb:
                chat_model = app.config["CHAT_MODEL"]
                chat_model.temperature = 1
                chat_model.streaming = True

                system_prompt = SystemMessage(
                    content=
                    """
                    以下の論文内容に対してなんJの架空のスレを創造的に書いてください。

                    [指示]
                    ・論文内容をしっかりと理解し、ステップバイステップで考えてください。
                    ・レス番や名前、投稿日時、IDも書き、アンカーは全角で＞＞と書いてください。
                    ・10人以上の専門家と2人の初学者をスレ登場させて多角的に議論してください。
                    ・意味のある議論をしてください。お互いを応援するやり取りなどはしないでください。
                    ・スレタイトルも考えて、30回以上やり取りしてください。
                    ・専門用語は適宜説明を入れてください。
                    ・論文の内容を正確に理解した上で、なんJ民らしい口調で解説してください。
                      例）～～やな。～～よな。～～んやね。～～わけや。～～するん？～～みるわ。
                    ・スレッドの形式は以下のようにしてください


                    ## 【スレタイ】(スレッドタイトル)


                    ### 1 名前：以下、名無しにかわりまして深層学習初学者がお送りします。 [yyyy/mm/dd(木) hh:mm:ss.ss] ID:xxXXxx0


                    (スレ開始メッセージ)


                    ### 2 名前：△△ [yyyy/mm/dd(木) hh:mm:ss.ss] ID:yYyYyY1


                    ＞＞1


                    （以下、レスが続く）
                    """
                )
                thread_message = HumanMessage(content=md_text)
                messages = [system_prompt, thread_message]

                for result in chat_model.stream(messages):
                    result_text += result.content
                    if result == '':
                        continue
                    yield f'data: {json.dumps({"llm_output": result.content})}\n\n'

                print(f"\nTotal Tokens: {cb.total_tokens}")
                print(f"Prompt Tokens: {cb.prompt_tokens}")
                print(f"Completion Tokens: {cb.completion_tokens}")
                print(f"Total Cost (USD): ${cb.total_cost}\n")

            thread_md_filename = os.path.join(dir_path, f"{base_name}_thread.md")

            result_text = result_text.replace("```markdown", "").replace("```", "")
            with open(thread_md_filename, mode="w", encoding="utf-8") as f:
                f.write(result_text)

            yield f'data: {json.dumps({"llm_output": "$=~=$end$=~=$"})}\n\n'
            yield f'data: {json.dumps({"status": "スレッド生成が完了しました"})}\n\n'

        except Exception as e:
            error_traceback = traceback.format_exc()
            print(error_traceback)
            yield f'data: {json.dumps({"error": f"Error during thread generation: {str(e)}"})}\n\n'
            return

    return Response(generate(), mimetype='text/event-stream')

########################################################################
# メイン
########################################################################
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--aoai', action='store_true', help="Use AzureOpenAI instead of ChatOpenAI")
    args = parser.parse_args()

    if args.aoai:
        app.config["CHAT_MODEL"] = AzureChatOpenAI(
            openai_api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
            azure_deployment=os.getenv("AZURE_CHAT_DEPLOYMENT"),
            temperature=0
        )
        print(">>> AzureOpenAI を使用します。")
    else:
        app.config["CHAT_MODEL"] = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=1
        )
        print(">>> ChatOpenAI を使用します。")

    app.run(host='0.0.0.0', port=5601, debug=True)

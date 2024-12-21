import glob
import os
import json
import time
from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
from flask_cors import CORS
import requests
from io import BytesIO
import traceback
from datetime import datetime
from dotenv import load_dotenv

import sqlite3

from langchain_openai import ChatOpenAI
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

# コンテンツ格納ディレクトリ
CONTENT_DATA_DIR = "/home/ubuntu/workspace/contents"
os.makedirs(CONTENT_DATA_DIR, exist_ok=True)

# SQLite初期化
DB_PATH = os.path.join(CONTENT_DATA_DIR, 'chat_history.db')
conn = sqlite3.connect(DB_PATH, check_same_thread=False)
cursor = conn.cursor()

# セッションテーブル
cursor.execute('''
CREATE TABLE IF NOT EXISTS chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dir_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','+9 hours'))
)
''')

# メッセージテーブル
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


def remove_oldest_session_if_needed(dir_name):
    """
    指定ディレクトリのセッションが30件を超えた場合は最古のセッションを削除。
    """
    cursor.execute('''
        SELECT id FROM chat_sessions
        WHERE dir_name = ?
        ORDER BY created_at ASC
    ''', (dir_name,))
    sessions = cursor.fetchall()
    if len(sessions) > 30:
        oldest_id = sessions[0][0]
        cursor.execute('DELETE FROM chat_messages WHERE session_id = ?', (oldest_id,))
        cursor.execute('DELETE FROM chat_sessions WHERE id = ?', (oldest_id,))
        conn.commit()


@app.route('/create_chat_session', methods=['POST'])
def create_chat_session():
    """
    新しいチャットセッションを作成。dir_name が必須。
    """
    dir_name = request.args.get('dir_name', None)
    if not dir_name:
        return jsonify({'error': 'dir_name is required'}), 400

    if '..' in dir_name or '/' in dir_name or '\\' in dir_name:
        return jsonify({'error': 'Invalid directory name.'}), 400

    remove_oldest_session_if_needed(dir_name)

    cursor.execute(
        'INSERT INTO chat_sessions (dir_name) VALUES (?)',
        (dir_name,)
    )
    new_session_id = cursor.lastrowid
    conn.commit()

    return jsonify({'session_id': new_session_id}), 200


@app.route('/list_chat_sessions', methods=['GET'])
def list_chat_sessions():
    """
    指定された dir_name のチャットセッション一覧を新しい順に返す。
    """
    dir_name = request.args.get('dir_name', None)
    if not dir_name:
        return jsonify({'error': 'dir_name is required'}), 400

    if '..' in dir_name or '/' in dir_name or '\\' in dir_name:
        return jsonify({'error': 'Invalid directory name.'}), 400

    cursor.execute('''
        SELECT id, created_at
        FROM chat_sessions
        WHERE dir_name = ?
        ORDER BY created_at DESC
    ''', (dir_name,))
    rows = cursor.fetchall()

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
    content が JSON配列の場合: [{"type": "text", "text": ...}, {"type": "image_url", ...}]
    として複数メッセージに展開。そうでなければ1つのテキストメッセージとして扱う。
    """
    session_id = request.args.get('session_id', None)
    if not session_id:
        return jsonify({'error': 'session_id is required'}), 400

    cursor.execute('''
        SELECT role, content
        FROM chat_messages
        WHERE session_id = ?
        ORDER BY id ASC
    ''', (session_id,))
    rows = cursor.fetchall()

    all_messages = []
    for (role, raw_content) in rows:
        try:
            data = json.loads(raw_content)  # JSONパース
            if isinstance(data, list):
                # 複数メッセージ分割
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
                # JSONだけど配列じゃない
                all_messages.append({
                    "role": role,
                    "type": "text",
                    "content": str(data)
                })
        except:
            # JSONでなければ、そのままテキストとして
            all_messages.append({
                "role": role,
                "type": "text",
                "content": raw_content
            })

    return jsonify({'messages': all_messages}), 200


@app.route('/delete_chat_session', methods=['POST'])
def delete_chat_session():
    data = request.get_json()
    if not data or 'session_id' not in data:
        return jsonify({'error': 'session_id is required'}), 400
    session_id = data['session_id']

    cursor.execute('DELETE FROM chat_messages WHERE session_id = ?', (session_id,))
    cursor.execute('DELETE FROM chat_sessions WHERE id = ?', (session_id,))
    conn.commit()

    return jsonify({'message': f'Session {session_id} deleted.'}), 200


@app.route('/bulk_save_chat', methods=['POST'])
def bulk_save_chat():
    """
    旧セッションのチャット履歴を新セッションにまとめて保存し直すためのエンドポイント
    """
    data = request.get_json()
    session_id = data.get('session_id')
    messages = data.get('messages', [])

    if not session_id:
        return jsonify({'error': 'session_id is required'}), 400
    if not isinstance(messages, list) or len(messages) == 0:
        return jsonify({'error': 'No messages to save or invalid format'}), 400

    for m in messages:
        role = m.get('role')
        content = m.get('content')
        if role and content:
            cursor.execute('''
                INSERT INTO chat_messages (session_id, role, content)
                VALUES (?, ?, ?)
            ''', (session_id, role, content))
    conn.commit()

    return jsonify({'message': 'Bulk save complete'}), 200


def save_chat_message(session_id, role, content):
    """
    1件のメッセージをDBに保存。
    content は JSON文字列でも、プレーンテキストでもよい。
    """
    cursor.execute('''
        INSERT INTO chat_messages (session_id, role, content)
        VALUES (?, ?, ?)
    ''', (session_id, role, content))
    conn.commit()


@app.route('/contents/<path:filename>', methods=['GET'])
def serve_content_files(filename):
    """
    contents ディレクトリからファイルを提供するエンドポイント。
    """
    try:
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
    contents ディレクトリ直下にあるサブディレクトリ一覧を返す。
    新しい順（更新時刻が新しい順）にソート。
    """
    try:
        dir_paths = [
            os.path.join(CONTENT_DATA_DIR, d)
            for d in os.listdir(CONTENT_DATA_DIR)
            if os.path.isdir(os.path.join(CONTENT_DATA_DIR, d))
        ]
        dir_paths_sorted = sorted(dir_paths, key=os.path.getmtime, reverse=True)
        directories = []
        for dir_path in dir_paths_sorted:
            d = os.path.basename(dir_path)
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


@app.route('/pdf2markdown', methods=['POST'])
def pdf2markdown():
    """
    PDFファイルを受け取り（またはURL）、Markdownへ変換。
    SSE (Server-Sent Events)で進捗を返す。
    """
    @stream_with_context
    def generate():
        pdf_stream = None
        base_file_name = ''
        try:
            if 'file' in request.files:
                pdf_file = request.files['file']
                file_name = pdf_file.filename
                base_file_name = os.path.splitext(file_name)[0]
                pdf_stream = pdf_file.stream
            elif request.is_json and 'url' in request.json:
                pdf_url = request.json['url']
                file_name = os.path.basename(pdf_url)
                if not file_name.lower().endswith('.pdf'):
                    file_name += '.pdf'
                base_file_name = os.path.splitext(file_name)[0]
                response = requests.get(pdf_url)
                response.raise_for_status()
                pdf_stream = BytesIO(response.content)
            else:
                raise ValueError("No valid PDF file or URL provided")
        except ValueError as ve:
            yield f'data: {json.dumps({"error": str(ve)})}\n\n'
            return
        except requests.exceptions.RequestException as e:
            yield f'data: {json.dumps({"error": f"Failed to fetch PDF from URL: {str(e)}"})}\n\n'
            return
        except Exception as e:
            yield f'data: {json.dumps({"error": f"Unexpected error during data retrieval: {str(e)}"})}\n\n'
            return

        try:
            for message in extract_text_from_pdf(pdf_stream, file_name):
                yield f'data: {message}\n\n'
        except Exception as e:
            error_traceback = traceback.format_exc()
            print(error_traceback)
            yield f'data: {json.dumps({"error": f"Error extracting text from PDF: {str(e)}"})}\n\n'
            return

    return Response(generate(), mimetype='text/event-stream')


def extract_text_from_pdf(pdf_stream, file_name):
    """
    PDFを解析し、Markdownに変換（+ 画像を保存）する処理。
    SSE進捗を返すため、ジェネレータを使う。
    """
    start_time = time.time()

    base_name = os.path.splitext(file_name)[0]
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    dir_name = f"{timestamp}_{base_name}"
    output_dir = os.path.join(CONTENT_DATA_DIR, dir_name)
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

    # GPT (gpt-4o-mini)を使ってマークダウンに図表リンクを追記させる
    chat_model = ChatOpenAI(model="gpt-4o-mini", temperature=0, streaming=True)
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

    result_text = result_text.replace("```markdown", "").replace("```", "")

    md_filename = os.path.join(output_dir, f"{base_name}_origin.md")
    with open(md_filename, mode="w", encoding="utf-8") as f:
        f.write(result_text)

    yield json.dumps({"llm_output": "$=~=$end$=~=$"})
    yield json.dumps({"dir_name": dir_name, "base_file_name": base_name})


@app.route('/trans_markdown', methods=['POST'])
def trans_markdown():
    """
    origin.md を 日本語に翻訳して _trans.md を作成。
    SSE (Server-Sent Events)で進捗を返す。
    """
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
                chat_model = ChatOpenAI(model="gpt-4o-mini", temperature=0, streaming=True)
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


@app.route('/save_markdown', methods=['POST'])
def save_markdown():
    """
    指定ディレクトリ下の Markdown ファイルを上書き保存。
    """
    try:
        data = request.get_json()
        dir_name = data.get('dir_name')
        file_name = data.get('file_name')
        content = data.get('content')

        if not dir_name or not file_name or content is None:
            return jsonify({'error': 'dir_name, file_name, and content are required.'}), 400

        if '..' in dir_name or '/' in dir_name or '\\' in dir_name:
            return jsonify({'error': 'Invalid directory name.'}), 400

        if '..' in file_name or '/' in file_name or '\\' in file_name:
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


@app.route('/delete_directory', methods=['POST'])
def delete_directory():
    """
    指定ディレクトリごと削除。
    """
    try:
        data = request.get_json()
        dir_name = data.get('dir_name')
        if not dir_name:
            return jsonify({'error': 'dir_name is required.'}), 400

        if '..' in dir_name or '/' in dir_name or '\\' in dir_name:
            return jsonify({'error': 'Invalid directory name.'}), 400

        target_dir = os.path.join(CONTENT_DATA_DIR, dir_name)
        if not os.path.isdir(target_dir):
            return jsonify({'error': 'Directory not found.'}), 404

        import shutil
        shutil.rmtree(target_dir)
        return jsonify({'message': f'Directory "{dir_name}" has been deleted successfully.'}), 200
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(error_traceback)
        return jsonify({'error': f'Error deleting directory: {str(e)}'}), 500


@app.route('/initialize_state', methods=['GET'])
def initialize_state():
    """
    指定ディレクトリ内の _origin.md をLLM用の初期状態として読み込む。
    """
    input_dir_param = request.args.get('input_dir')
    if not input_dir_param:
        return jsonify({"error": "input_dir パラメータが必要です。"}), 400

    if '..' in input_dir_param or '/' in input_dir_param or '\\' in input_dir_param:
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


class State(TypedDict):
    messages: Annotated[list, add_messages]


def initialize_agent():
    """
    langgraphでStateGraphを構築し、ChatOpenAIモデルと結びつける。
    """
    graph_builder = StateGraph(State)
    chat_model = ChatOpenAI(model="gpt-4o-mini", temperature=1)

    def chatbot(state: State):
        return {"messages": [chat_model.invoke(state["messages"])]}

    graph_builder.add_node("chatbot", chatbot)
    graph_builder.set_entry_point("chatbot")
    agent = graph_builder.compile()
    return agent


@app.route('/scholar_agent', methods=['POST'])
def scholar_agent():
    """
    user_input 内に画像やテキストを含め、LLMへ渡す。
    DBには user_input(JSON文字列) をそのまま保存。
    実際にLLMには、画像もテキストもまとめて1つの文字列にして入力。
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSONペイロードが必要です。"}), 400

    state = data.get('state')
    user_input = data.get('user_input')  # JSON文字列
    session_id = data.get('session_id')

    if not state:
        return jsonify({"error": "state が必要です。"}), 400
    if not user_input:
        return jsonify({"error": "user_input が必要です。"}), 400
    if not session_id:
        return jsonify({"error": "session_id が必要です。"}), 400
    if not isinstance(state, dict) or 'messages' not in state:
        return jsonify({"error": "state は有効な形式でなければなりません。"}), 400

    try:
        # 1) DBに保存（そのまま JSON文字列）
        save_chat_message(session_id, 'user', user_input)

        # 2) LLMに入力するため、 user_input(JSON)をパースして文字列を構築
        user_str_for_llm = ""
        try:
            parsed_list = json.loads(user_input)  # [ {type:..., text:...}, ... ]
            if isinstance(parsed_list, list):
                for item in parsed_list:
                    if item.get("type") == "text":
                        user_str_for_llm += f"ユーザーのメッセージ: {item.get('text','')}\n"
                    elif item.get("type") == "image_url":
                        user_str_for_llm += f"ユーザーは画像をアップロードしました: {item['image_url']['url']}\n"
            else:
                # 配列でない場合
                user_str_for_llm += f"ユーザーのメッセージ(配列でない): {json.dumps(parsed_list, ensure_ascii=False)}\n"
        except:
            # JSONでなければそのまま
            user_str_for_llm = f"ユーザーのメッセージ: {user_input}"

        # 3) ステートにユーザーメッセージを追加
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
        save_chat_message(session_id, 'assistant', response)

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


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5601, debug=True)

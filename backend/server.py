import os
import json
import time
import base64
from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
from flask_cors import CORS
import requests
from io import BytesIO
import traceback
from datetime import datetime
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_community.callbacks.manager import get_openai_callback

from typing import Annotated  # 型ヒント用のモジュール
from typing_extensions import TypedDict  # 型ヒント用の拡張モジュール
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

CONTENT_DATA_DIR = "/home/ubuntu/workspace/contents"

# contents ディレクトリ内のファイルを提供するエンドポイント
@app.route('/contents/<path:filename>', methods=['GET'])
def serve_content_files(filename):
    """
    指定されたファイルを contents ディレクトリから提供するエンドポイント。
    セキュリティ対策として、CONTENT_DATA_DIR以下のファイルのみを提供。
    """
    try:
        # セキュリティ対策: CONTENT_DATA_DIR以下のファイルのみを提供
        safe_path = os.path.join(CONTENT_DATA_DIR, filename)
        if not os.path.abspath(safe_path).startswith(os.path.abspath(CONTENT_DATA_DIR)):
            return jsonify({'error': 'Invalid file path'}), 400
        # ファイルを提供
        return send_from_directory(CONTENT_DATA_DIR, filename)
    except FileNotFoundError:
        return jsonify({'error': 'File not found'}), 404

# ディレクトリ内のマークダウンファイルとPDFファイルを一覧取得するエンドポイント
@app.route('/list_files/<path:dir_name>', methods=['GET'])
def list_files(dir_name):
    """
    指定されたディレクトリ内のマークダウンファイルとPDFファイルの一覧を取得するエンドポイント。
    ディレクトリには必ず1つのPDFファイルが存在すると仮定。
    """
    try:
        dir_path = os.path.join(CONTENT_DATA_DIR, dir_name)
        if not os.path.isdir(dir_path):
            return jsonify({'error': 'Directory not found'}), 404
        files = os.listdir(dir_path)
        markdown_files = [f for f in files if f.lower().endswith('.md')]
        pdf_files = [f for f in files if f.lower().endswith('.pdf')]
        
        # PDFファイルが1つであることを確認
        if len(pdf_files) != 1:
            return jsonify({'error': 'ディレクトリ内にPDFファイルが1つではありません'}), 400
        
        return jsonify({
            'markdown_files': markdown_files,
            'pdf_file': pdf_files[0]  # 単一のPDFファイル
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/list_contents', methods=['GET'])
def list_contents():
    """
    contents ディレクトリ内のサブディレクトリ一覧を更新日時の降順で返すエンドポイント。
    ディレクトリ名からタイムスタンプを除去して表示名を作成する。
    """
    try:
        dir_paths = [os.path.join(CONTENT_DATA_DIR, d) for d in os.listdir(CONTENT_DATA_DIR) if os.path.isdir(os.path.join(CONTENT_DATA_DIR, d))]
        # ディレクトリの更新日時でソート（新しい順）
        dir_paths_sorted = sorted(dir_paths, key=os.path.getmtime, reverse=True)
        directories = []
        for dir_path in dir_paths_sorted:
            d = os.path.basename(dir_path)
            # タイムスタンプを除去して表示名を作成
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


# アップロードされたPDFを解析しマークダウンにして保存するエンドポイント
@app.route('/pdf2markdown', methods=['POST'])
def pdf2markdown():
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
    PDFストリームからテキストを抽出し、マークダウンに変換して保存する。
    """

    start_time = time.time()

    # 保存先ディレクトリの作成
    base_name = os.path.splitext(file_name)[0]
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    dir_name = f"{timestamp}_{base_name}"  # タイムスタンプを含める
    output_dir = os.path.join(CONTENT_DATA_DIR, dir_name)
    os.makedirs(output_dir, exist_ok=True)

    yield json.dumps({"status": "Saving PDF file..."})

    # PDFを保存
    pdf_file_path = os.path.join(output_dir, file_name)
    with open(pdf_file_path, mode="wb") as f:
        f.write(pdf_stream.read())

    # パイプラインの設定
    yield json.dumps({"status": "Processing PDF..."})
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

    # PDFを解析
    conv_res = converter.convert(pdf_file_path)
    yield json.dumps({"status": "Saving images..."})

    # 図と表を保存
    table_counter = 0
    picture_counter = 0
    for element, _level in conv_res.document.iterate_items():
        if isinstance(element, TableItem):
            table_counter += 1
            element_image_filename = \
                os.path.join(output_dir, f"table-{table_counter}.png")
            
            with open(element_image_filename, "wb") as fp:
                element.image.pil_image.save(fp, "PNG")

        if isinstance(element, PictureItem):
            picture_counter += 1
            element_image_filename = \
                os.path.join(output_dir, f"picture-{picture_counter}.png")
            with open(element_image_filename, "wb") as fp:
                element.image.pil_image.save(fp, "PNG")

    # マークダウンに変換
    yield json.dumps({"status": "Converting to Markdown..."})
    md_text = conv_res.document.export_to_markdown()

    yield json.dumps({"llm_output": "start"})
    result_text = ""

    with get_openai_callback() as cb:

        # LLMで調整
        chat_model = ChatOpenAI(model="gpt-4o-mini", temperature=0, streaming=True)
        system_prompt = SystemMessage(
            content=\
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
    
    yield json.dumps({"llm_output": "end"})

    result_text = result_text.replace("```markdown", "").replace("```", "")

    # マークダウンを保存
    md_filename = os.path.join(output_dir, f"{base_name}_origin.md")
    with open(md_filename, mode="w", encoding="utf-8") as f:
        f.write(result_text)
    
    end_time = time.time()
    print(f"Total time: {(end_time - start_time):.2f} sec")


    # 保存先のディレクトリ名を返す
    yield json.dumps({"dir_name": dir_name, "base_file_name": base_name})


# 追加: マークダウンを日本語に翻訳するエンドポイント
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

            # originが付くマークダウンファイルを取得
            files = os.listdir(dir_path)
            origin_md_files = [f for f in files if f.lower().endswith('_origin.md')]
            if not origin_md_files:
                yield f'data: {json.dumps({"error": "Origin markdown file not found"})}\n\n'
                return

            origin_md_file = origin_md_files[0]
            origin_md_path = os.path.join(dir_path, origin_md_file)
            base_name = os.path.splitext(origin_md_file)[0].replace('_origin', '')

            # マークダウンテキストを読み込む
            with open(origin_md_path, 'r', encoding='utf-8') as f:
                md_text = f.read()

            yield f'data: {json.dumps({"status": "Translating to Japanese..."})}\n\n'

            yield f'data: {json.dumps({"llm_output": "start"})}\n\n'
            result_text = ""

            with get_openai_callback() as cb:
                # LLMで翻訳
                chat_model = ChatOpenAI(model="gpt-4o-mini", temperature=0, streaming=True)
                system_prompt = SystemMessage(
                    content=\
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
            
            yield f'data: {json.dumps({"llm_output": "end"})}\n\n'

            # 翻訳結果を保存
            ja_md_filename = os.path.join(dir_path, f"{base_name}_trans.md")
            with open(ja_md_filename, mode="w", encoding="utf-8") as f:
                f.write(result_text)

            yield f'data: {json.dumps({"status": "Translation completed", "base_file_name": base_name})}\n\n'

        except Exception as e:
            error_traceback = traceback.format_exc()
            print(error_traceback)
            yield f'data: {json.dumps({"error": f"Error during translation: {str(e)}"})}\n\n'
            return

    return Response(generate(), mimetype='text/event-stream')


# 追加: 編集モードでマークダウンを保存するエンドポイント
@app.route('/save_markdown', methods=['POST'])
def save_markdown():
    """
    クライアントから送信されたマークダウン内容を指定されたディレクトリとファイルに保存するエンドポイント。
    リクエストボディ:
    {
        "dir_name": "ディレクトリ名",
        "file_name": "ファイル名.md",
        "content": "マークダウン内容"
    }
    """
    try:
        data = request.get_json()
        dir_name = data.get('dir_name')
        file_name = data.get('file_name')
        content = data.get('content')

        # 必要なフィールドがすべて存在するか確認
        if not dir_name or not file_name or content is None:
            return jsonify({'error': 'dir_name, file_name, and content are required.'}), 400

        # セキュリティ対策: ディレクトリ名とファイル名にディレクトリトラバーサルが含まれていないかチェック
        if '..' in dir_name or '/' in dir_name or '\\' in dir_name:
            return jsonify({'error': 'Invalid directory name.'}), 400

        if '..' in file_name or '/' in file_name or '\\' in file_name:
            return jsonify({'error': 'Invalid file name.'}), 400

        # ファイル名が .md で終わることを確認
        if not file_name.lower().endswith('.md'):
            return jsonify({'error': 'Invalid file name. Must end with .md'}), 400

        # 対象ディレクトリのパスを構築
        target_dir = os.path.join(CONTENT_DATA_DIR, dir_name)
        if not os.path.isdir(target_dir):
            return jsonify({'error': 'Directory not found.'}), 404

        # 対象ファイルのパスを構築
        target_file_path = os.path.join(target_dir, file_name)

        # ファイルを保存
        with open(target_file_path, 'w', encoding='utf-8') as f:
            f.write(content)

        return jsonify({'message': 'File saved successfully.'}), 200

    except Exception as e:
        error_traceback = traceback.format_exc()
        print(error_traceback)
        return jsonify({'error': f'Error saving file: {str(e)}'}), 500

# 追加: ディレクトリを削除するエンドポイント
@app.route('/delete_directory', methods=['POST'])
def delete_directory():
    """
    クライアントから送信されたディレクトリ名を削除するエンドポイント。
    リクエストボディ:
    {
        "dir_name": "ディレクトリ名"
    }
    """
    try:
        data = request.get_json()
        dir_name = data.get('dir_name')

        # 必要なフィールドが存在するか確認
        if not dir_name:
            return jsonify({'error': 'dir_name is required.'}), 400

        # セキュリティ対策: ディレクトリ名にディレクトリトラバーサルが含まれていないかチェック
        if '..' in dir_name or '/' in dir_name or '\\' in dir_name:
            return jsonify({'error': 'Invalid directory name.'}), 400

        # 対象ディレクトリのパスを構築
        target_dir = os.path.join(CONTENT_DATA_DIR, dir_name)
        if not os.path.isdir(target_dir):
            return jsonify({'error': 'Directory not found.'}), 404

        # ディレクトリとその内容を削除
        import shutil
        shutil.rmtree(target_dir)

        return jsonify({'message': f'Directory "{dir_name}" has been deleted successfully.'}), 200

    except Exception as e:
        error_traceback = traceback.format_exc()
        print(error_traceback)
        return jsonify({'error': f'Error deleting directory: {str(e)}'}), 500

@app.route('/initialize_state', methods=['GET'])
def initialize_state():

    # リクエストからinput_dirを取得（クエリパラメータとして）
    input_dir_param = request.args.get('input_dir')
    
    if not input_dir_param:
        return jsonify({"error": "input_dir パラメータが必要です。"}), 400

    # セキュリティ対策: ディレクトリ名にディレクトリトラバーサルが含まれていないかチェック
    if '..' in input_dir_param or '/' in input_dir_param or '\\' in input_dir_param:
        return jsonify({'error': 'Invalid directory name.'}), 400

    input_dir = os.path.join(CONTENT_DATA_DIR, input_dir_param)
    
    if not os.path.isdir(input_dir):
        return jsonify({"error": f"指定されたディレクトリが存在しません: {input_dir_param}"}), 400

    # マークダウンファイルを取得
    md_files = [f for f in os.listdir(input_dir) if f.endswith('_origin.md')]
    if not md_files:
        return jsonify({"error": "ディレクトリ内に_origin.mdファイルが存在しません。"}), 400

    md_path = os.path.join(input_dir, md_files[0])

    with open(md_path, mode="r") as f:
        md_text = f.read()

    # 画像のパスリストを取得
    png_files = []
    for root, dirs, files in os.walk(input_dir):
        for file in files:
            if (file.startswith('table') or file.startswith('picture')) and file.endswith('.png'):
                png_files.append(os.path.join(root, file))

    # 状態の型定義
    class State(TypedDict):
        messages: Annotated[list, add_messages]

    # グラフビルダーを作成
    graph_builder = StateGraph(State)
    chat_model = ChatOpenAI(model="gpt-4o-mini", temperature=1)

    # チャットボット関数
    def chatbot(state: State):
        return {"messages": [chat_model.invoke(state["messages"])]}

    graph_builder.add_node("chatbot", chatbot)
    graph_builder.set_entry_point("chatbot")
    agent = graph_builder.compile()

    # チャットヒストリーを作成
    state = {"messages": []}

    # システムプロンプトを設定
    system_prompt = """
あなたは、論文解説のスペシャリストです。
以下の論文内容を理解し、ユーザーからの質問に分かりやすく回答してください。
"""
    system_message = {
        "role": "system",
        "content": system_prompt
    }
    state["messages"].append(system_message)

    # ユーザープロンプトを設定
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

    # 画像の情報を追加
    image_info = "\n\n<図の詳細>"
    for i, png_file in enumerate(png_files):
        png_file_name = os.path.basename(png_file)
        image_info += f"\n{i+1}つ目の画像は、{png_file_name}です。"
    image_info += "\n</図の詳細>"

    user_prompt_text += image_info

    # ユーザーメッセージを作成
    user_message = {
        "role": "user",
        "content": user_prompt_text
    }
    state["messages"].append(user_message)

    # AIからの最初の応答を設定
    assistant_prompt = """
論文内容を理解しました。
質問をどうぞ。
"""
    state["messages"].append(
        {"role": "assistant", "content": assistant_prompt},
    )

    # stateをJSON形式で返す
    return jsonify(state)

# 状態の型定義
class State(TypedDict):
    messages: Annotated[list, add_messages]


def initialize_agent():
    """
    指定されたディレクトリから必要なファイルを読み込み、
    エージェントと初期状態（state）を初期化します。
    """

    # グラフビルダーを作成
    graph_builder = StateGraph(State)
    chat_model = ChatOpenAI(model="gpt-4o-mini", temperature=1)

    # チャットボット関数
    def chatbot(state: State):
        return {"messages": [chat_model.invoke(state["messages"])]}

    graph_builder.add_node("chatbot", chatbot)
    graph_builder.set_entry_point("chatbot")
    agent = graph_builder.compile()

    return agent


@app.route('/scholar_agent', methods=['POST'])
def scholar_agent():
    """
    エージェントを作成し、リクエストからメッセージの履歴とユーザーからの質問を受け取って、
    エージェントで質問に回答し、生成された回答と更新されたメッセージの履歴をレスポンスで返します。
    """
    data = request.get_json()

    if not data:
        return jsonify({"error": "JSONペイロードが必要です。"}), 400

    state = data.get('state')
    user_input = data.get('user_input')

    if not state:
        return jsonify({"error": "state が必要です。"}), 400

    if not user_input:
        return jsonify({"error": "user_input が必要です。"}), 400

    if not isinstance(state, dict) or 'messages' not in state:
        return jsonify({"error": "state は有効な形式でなければなりません。"}), 400

    try:
        # エージェントと初期状態を初期化
        agent = initialize_agent()

        # ユーザーの質問を状態に追加
        user_message = {
            "role": "user",
            "content": user_input
        }
        state["messages"].append(user_message)

        # ユーザー入力に基づいてチャットボットが応答を生成
        with get_openai_callback() as cb:
            # agent.streamを使用して応答を取得
            for event in agent.stream(state):
                for value in event.values():
                    response = value["messages"][-1].content
                    state["messages"].append({"role": "assistant", "content": response})
        
        # レスポンスの生成
        response_data = {
            "response": response,
            "state": state
        }

        return jsonify(response_data)
    
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"内部エラーが発生しました: {str(e)}"}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5601, debug=True)

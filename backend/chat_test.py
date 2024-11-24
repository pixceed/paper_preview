import os
import base64

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from typing import Annotated  # 型ヒント用のモジュール
from typing_extensions import TypedDict  # 型ヒント用の拡張モジュール
from langgraph.graph import StateGraph
from langgraph.graph.message import add_messages

from langchain_core.prompts import PromptTemplate

from langchain_community.callbacks.manager import get_openai_callback

# .envファイルから環境変数を読み込み
load_dotenv()

def main():

    input_dir = "contents/20241123181330_2408.14837"

    # ＜情報取得＞
    # マークダウンテキスト取得
    md_path = os.path.join(input_dir, "2408.14837_origin.md")
    with open(md_path, mode="r") as f:
        md_text = f.read()

    # 画像のパスリストを取得
    png_files = []
    for root, dirs, files in os.walk(input_dir):
        for file in files:
            # ファイル名が'table'で始まり、拡張子が.pngのものを探す
            if file.startswith('table') and file.endswith('.png'):
                # ファイルパスを絶対パスに変換してリストに追加
                png_files.append(os.path.join(root, file))

    # ＜エージェント設定＞
    # 状態の型定義。messagesにチャットのメッセージ履歴を保持する
    class State(TypedDict):
        messages: Annotated[list, add_messages]
    
    # グラフビルダーを作成し、チャットボットのフローを定義
    graph_builder = StateGraph(State)

    # OpenAIのLLMインスタンス作成
    chat_model = ChatOpenAI(model="gpt-4o-mini", temperature=1)

    # チャットボット関数。状態に応じてLLMが応答を生成
    def chatbot(state: State):
        return {"messages": [chat_model.invoke(state["messages"])]}

    # グラフを構築
    graph_builder.add_node("chatbot", chatbot)
    graph_builder.set_entry_point("chatbot")

    # グラフをコンパイル
    agent = graph_builder.compile()

    # チャットヒストリーを作成
    state = {"messages": []}

    # システムプロンプトを設定
    system_prompt = \
"""
あなたは、論文解説のスペシャリストです。
以下の論文内容を理解し、ユーザーからの質問に分かりやすく回答してください。
"""
    system_message = {
        "role": "system",
        "content": system_prompt
    }
    state["messages"].append(system_message)

    # ユーザーからの最初の質問を設定
    prompt_template = PromptTemplate(
        input_variables=["paper_content"],
        template=\
"""
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
    user_content = []

    user_prompt_text += f"\n\n<図の詳細>"
    for i in range(len(png_files)):
        png_file_name = png_files[i].split('/')[-1]
        user_prompt_text += f"\n{i+1}つ目の画像は、{png_file_name}です。"
    user_prompt_text += f"\n</図の詳細>"

    user_content.append(
        {
        "type": "text",
        "text": user_prompt_text
        }
    )

    for image_path in png_files:
        # 画像をbase64形式のデータに変換
        with open(image_path, "rb") as image_file:
            # base64エンコード
            encoded_string = base64.b64encode(image_file.read())
            # バイト列を文字列にデコードして返す
            image_data = encoded_string.decode('utf-8')

            user_content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{image_data}"},
                }
            )

    user_message = {
        "role": "user",
        "content": user_content
    }
    state["messages"].append(user_message)

    # AIからの最初の応答を設定
    assistant_prompt = \
"""
論文内容を理解しました。
質問をどうぞ。
"""
    state["messages"].append(
        {"role": "assistant", "content": assistant_prompt},
    )

    # ユーザーの入力に基づいてチャットボットが応答を生成し、その過程をリアルタイムでストリームする関数
    def stream_graph_updates(user_input: str):
        # ユーザーの入力をメッセージに追加
        state["messages"].append(("user", user_input))  

        with get_openai_callback() as cb:
        
            # グラフのstreamメソッドを使用して、メッセージに応じたイベントを処理
            for event in agent.stream(state):
                for value in event.values():
                    # チャットボットの応答をメッセージに追加
                    response = value["messages"][-1].content
                    state["messages"].append(("assistant", response))  # 応答もメッセージリストに追加
                    print("Assistant:", response)
            
            print("\n------------------------------------------------")
            print(f"Total Tokens: {cb.total_tokens}")
            print(f"Prompt Tokens: {cb.prompt_tokens}")
            print(f"Completion Tokens: {cb.completion_tokens}")
            print(f"Total Cost (USD): ${cb.total_cost}")
            print("------------------------------------------------\n")

    # 無限ループを使用してユーザー入力を連続的に処理
    while True:
        try:
            # ユーザーからの入力を取得
            user_input = input("User: ")
            
            # "quit", "exit", "q"の入力でループを終了
            if user_input.lower() in ["quit", "exit", "q"]:
                print("Goodbye!")  # 終了メッセージを表示
                break  # ループを抜ける

            # ユーザーの入力を基にチャットボットが応答を生成し、リアルタイムで出力
            stream_graph_updates(user_input)

        except Exception as e:

            print(f"エラーが出ました\n{e}")  # 既定のユーザー入力を表示
            stream_graph_updates(user_input)  # その入力に対してチャットボットが応答を生成
            break  # エラーハンドリング後にループを終了


if __name__=="__main__":
    main()
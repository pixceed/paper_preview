import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate

# .envファイルから環境変数を読み込み
load_dotenv()

def business_mail_generator_llm(mail_origin):

    # ＜ LLMモデル ＞
    chat_model = ChatOpenAI(
        model="gpt-4o",
        temperature=0  
    )


    # ＜ プロンプト ＞
    prompt = PromptTemplate.from_template(
    """
    <メール元文></メール元文>を、ビジネスメールとして相応しくなるように手直ししてください。
    相手に良い印象を与えるように心掛けてください。
    余計な文言は出力せず、変換後のメール内容のみを出力してください。

    <メール元文>
    {mail_origin}
    </メール元文>

    """
    )

    # chainの定義
    chain = prompt | chat_model

    # chainの実行
    response = chain.invoke({"mail_origin": mail_origin})
    print(response)

    return response.content

import os
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS

from apps.business_mail_generator_api import business_mail_generator_llm

app = Flask(__name__)
CORS(app)


# ビジネスメール生成APIエンドポイント
@app.route('/business_mail_generator_endpoint', methods=['POST'])
def business_mail_generator_listener():

    # リクエストボディを取得
    req_body = request.get_json()

    # テキストを読み込む
    text = req_body['text']

    # 入札価格決定サポートAPIを実行する
    result = business_mail_generator_llm(text)

    print('★★★★result:', result)

    return jsonify({'result': result}), 200




if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5534, debug=True)
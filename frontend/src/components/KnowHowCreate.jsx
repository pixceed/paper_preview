import React, { useState } from "react";
import ReactMarkdown from "react-markdown"; // マークダウン表示用
import { useNavigate } from "react-router-dom"; // React Routerを使ってページ遷移する
import { IconButton, CircularProgress } from "@mui/material"; // Material-UI のコンポーネント
import CloseIcon from "@mui/icons-material/Close"; // Material-UI の「×」アイコン

function KnowHowCreate() {
  const [files, setFiles] = useState([]); // アップロードされたファイルを保存
  const [message, setMessage] = useState(""); // サーバーからの応答メッセージ（ノウハウ抽出結果）
  const [loadingExtract, setLoadingExtract] = useState(false); // ノウハウ抽出のローディング状態
  const [loadingRegister, setLoadingRegister] = useState(false); // 登録中のローディング状態
  const [error, setError] = useState(null); // エラーメッセージを保存
  const [tags, setTags] = useState([]); // タグの保存
  const [newTag, setNewTag] = useState(""); // 新しいタグの保存
  const [isMarkdown, setIsMarkdown] = useState(true); // 表示モードの切り替え
  const [knowledgeName, setKnowledgeName] = useState(""); // ナレッジ名

  const navigate = useNavigate(); // ページ遷移用

  const handleFileChange = (e) => {
    let newFiles = Array.from(e.target.files || e.dataTransfer.files);
    setFiles((prevFiles) => [...prevFiles, ...newFiles]);
    setError(null); // エラーメッセージをリセット
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleRemoveFile = (index) => {
    setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
  };

  // ノウハウ登録用の関数
  const handleRegister = async () => {
    const formData = new FormData();
    formData.append("knowledge_name", knowledgeName);
    formData.append("knowledge_content", message); // ノウハウ抽出結果をナレッジ内容として使用
    tags.forEach((tag) => formData.append("tags", tag));

    // ファイル名のリストを送信
    files.forEach((file) => {
      formData.append("files", file.name);  // ファイル名のみを送信
    });

    try {
      setLoadingRegister(true); // 登録のローディングを開始
      setError(null);
      setMessage(""); // メッセージのリセット

      // Flaskサーバーへリクエストを送信
      const response = await fetch("http://10.20.33.5:5534/knowhow", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setMessage("ノウハウが正常に登録されました: " + data.id);
        // 登録が完了したら、ノウハウリストページにリダイレクト
        navigate("/knowhows");
      } else {
        setError("登録に失敗しました: " + data.error);
      }
    } catch (error) {
      setError("サーバーとの通信に失敗しました。");
    } finally {
      setLoadingRegister(false); // ローディング終了
    }
  };

  // ノウハウ抽出の関数
  const handleSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData();

    if (files.length === 0) {
      setError("少なくとも1つのファイルをアップロードしてください");
      return;
    }

    files.forEach((file) => {
      formData.append("files", file);
    });

    try {
      setLoadingExtract(true); // ノウハウ抽出のローディングを開始
      setError(null);
      setMessage(""); // メッセージのリセット

      const response = await fetch("http://10.20.33.5:5534/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.answer); // 取得したノウハウ抽出結果をメッセージに設定
      } else {
        setMessage(data.error);
      }
    } catch (error) {
      setMessage("ファイルのアップロード中にエラーが発生しました。");
    } finally {
      setLoadingExtract(false); // ローディング終了
    }
  };

  // ×ボタンを押した時にリダイレクトする処理
  const handleClose = () => {
    navigate("/knowhows"); // ノウハウリストページにリダイレクト
  };

  return (
    <>
      <div className="w-4/5 mx-auto pt-16 px-5 h-screen flex flex-col">
        <div className="flex justify-center flex-grow">
          <div className="w-full flex flex-col mt-3 mb-5 px-5 py-3 bg-white rounded-lg border border-gray-200">
            <div className="flex justify-between">
              <h3 className="text-2xl font-semibold text-gray-700">
                KnowHow追加
              </h3>
              <IconButton
                className="text-red-500 hover:text-red-700"
                disableRipple
                onClick={handleClose} // ×ボタンを押したときにリダイレクト
              >
                <CloseIcon />
              </IconButton>
            </div>

            <div className="flex flex-row p-2">
              <div className="flex-1 flex flex-row justify-between">
                {/* 左側: ファイルアップロード */}
                <div className="w-1/3 flex flex-col">
                  <h3 className="text-xl font-semibold text-gray-700 mb-4">ファイルアップロード</h3>

                  <div
                    onDrop={handleFileChange}
                    onDragOver={handleDragOver}
                    className="border-2 border-dashed border-gray-300 p-6 mb-4 rounded-md text-center transition hover:bg-gray-100"
                  >
                    <p className="text-gray-600 mb-2">
                      ファイルをここにドラッグ＆ドロップするか、クリックして選択
                    </p>
                    <input
                      type="file"
                      accept=".pdf,.txt,.md,.docx,.xlsx"
                      onChange={handleFileChange}
                      multiple
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer text-blue-500 underline font-medium"
                    >
                      ファイルを選択
                    </label>
                  </div>

                  <ul className="mb-4 overflow-auto max-h-92">
                    {files.map((file, index) => (
                      <li
                        key={index}
                        className="flex justify-between items-center mb-2 bg-gray-100 p-2 rounded-md shadow-sm"
                      >
                        <span className="text-sm font-medium">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(index)}
                          className="text-red-500 hover:underline text-sm"
                        >
                          削除
                        </button>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition font-medium"
                    disabled={loadingExtract}
                  >
                    {loadingExtract ? "ノウハウ抽出中..." : "生成AIでノウハウ抽出"}
                  </button>
                </div>

                {/* 右: ノウハウ抽出結果表示 */}
                <div className="w-2/3 flex-1 flex flex-col pl-5">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xl font-semibold text-gray-700">ノウハウ抽出結果</h3>
                    <button
                      className="bg-gray-300 text-gray-700 py-1 px-3 rounded-md hover:bg-gray-400 transition font-medium"
                      onClick={() => setIsMarkdown(!isMarkdown)}
                    >
                      {isMarkdown ? "生データ表示" : "マークダウン表示"}
                    </button>
                  </div>

                  <div
                    className="border p-4 bg-gray-50 rounded-md overflow-auto"
                    style={{ height: 'calc(100vh - 285px)' }} // ヘッダーとその他要素の高さを除く
                  >
                    {loadingExtract ? (
                      <div className="flex justify-center items-center h-full">
                        <CircularProgress size={28}/>
                        <p className="text-xl ml-3">ノウハウを抽出中...</p>
                      </div>
                    ) : message ? (
                      isMarkdown ? (
                        <ReactMarkdown className="markdown">{message}</ReactMarkdown>
                      ) : (
                        <pre className="text-sm text-gray-800 whitespace-pre-wrap">{message}</pre>
                      )
                    ) : (
                      <p className="text-center text-gray-500">結果がここに表示されます</p>
                    )}
                  </div>

                  <div className="flex justify-between">
                    {/* ナレッジ名の入力 */}
                    <div className="w-2/3 mt-4">
                      <input
                        type="text"
                        value={knowledgeName}
                        onChange={(e) => setKnowledgeName(e.target.value)}
                        placeholder="ナレッジ名を入力"
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-row-reverse mt-5">
                      <button
                        className="bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition font-medium"
                        onClick={handleRegister}
                        disabled={loadingRegister || !message}
                      >
                        {loadingRegister ? "登録中..." : "登録する"}
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </>
  );
}

export default KnowHowCreate;


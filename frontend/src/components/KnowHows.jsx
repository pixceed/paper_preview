import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // useNavigateをインポート
import { DataGrid } from "@mui/x-data-grid";
import ReactMarkdown from "react-markdown"; // マークダウン表示用

function KnowHows() {
  const [knowhows, setKnowHows] = useState([]); // ノウハウリストを保持
  const [loading, setLoading] = useState(true); // ローディング状態
  const [error, setError] = useState(null); // エラー状態
  const [searchTerm, setSearchTerm] = useState(""); // 検索用の状態
  const [selectedKnowHow, setSelectedKnowHow] = useState(null); // 選択されたノウハウの情報
  const [isMarkdown, setIsMarkdown] = useState(true); // マークダウン表示フラグ

  const navigate = useNavigate(); // ページ遷移用

  // データベースからノウハウを取得する関数
  const fetchKnowHows = async () => {
    try {
      const api_url = `http://${import.meta.env.VITE_APP_IP}:5534/knowhows`
      const response = await fetch(api_url);
      if (!response.ok) {
        throw new Error("データの取得に失敗しました");
      }
      const data = await response.json();
      setKnowHows(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // ノウハウ削除処理
  const deleteKnowHow = async (id) => {
    try {
      const api_url = `http://${import.meta.env.VITE_APP_IP}:5534/knowhows/${id}`
      const response = await fetch(api_url, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("削除に失敗しました");
      }
      // 削除後のリストを再取得
      fetchKnowHows();
      setSelectedKnowHow(null); // 選択中のノウハウをリセット
    } catch (err) {
      setError("削除に失敗しました");
    }
  };

  // コンポーネントがマウントされたときにデータをフェッチ
  useEffect(() => {
    fetchKnowHows();
  }, []);

  // 検索用のフィルタリング処理
  const filteredKnowHows = knowhows.filter((knowhow) =>
    knowhow.knowledge_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // DataGridに渡す列定義
  const columns = [
    { field: "id", headerName: "#", width: 50 },
    { field: "knowledge_name", headerName: "ナレッジ名", width: 300 },
    { field: "created_at", headerName: "作成日", width: 200 },
    {
      field: "tags",
      headerName: "タグ",
      width: 300,
      renderCell: (params) => params.value.join(", "),
    },
  ];

  // ノウハウデータの加工: 各データにidを付与する
  const rows = filteredKnowHows.map((knowhow, index) => ({
    id: index + 1,
    knowledge_name: knowhow.knowledge_name,
    created_at: knowhow.created_at,
    tags: knowhow.tags,
    knowledge_content: knowhow.knowledge_content, // ナレッジ内容を追加
  }));

  // 行クリック時のハンドラ
  const handleRowClick = (params) => {
    // 検索された状態でも正しくノウハウを取得
    const selected = filteredKnowHows.find((knowhow, index) => index + 1 === params.id);
    setSelectedKnowHow(selected);
  };

  // マークダウン表示の切り替え
  const toggleMarkdown = () => {
    setIsMarkdown(!isMarkdown);
  };

  return (
    <>
      <div className="w-4/5 mx-auto pt-16 px-5 h-screen flex flex-col">
        <div className="flex justify-center flex-grow">
          <div className="w-full mt-3 mb-5 shadow-sm bg-white  rounded-lg border border-gray-200 flex flex-col">
            <div className="p-5">
              <div className="flex justify-between items-center mb-4">
                {/* 検索バーとノウハウ追加ボタン */}
                <div className="flex items-center w-full">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="ナレッジ名で検索"
                    className="flex-grow px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => navigate("/create")} // ノウハウ追加時に"/create"へ遷移
                    className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    ノウハウ追加
                  </button>
                </div>
              </div>

              {/* エラーメッセージ表示 */}
              {error && <p className="text-red-500 mt-2">{error}</p>}

              {/* ローディング中のメッセージ */}
              {loading && (
                <p className="text-center text-gray-500 mt-2">読み込み中...</p>
              )}

              {/* テーブル表示 */}
              {!loading && !error && (
                <div className="flex-grow">
                  <div
                    className="resize-y overflow-auto border p-2"
                    style={{ height: 200 }} // 最初の高さを180pxに設定（5行分）
                  >
                    <DataGrid
                      rows={rows}
                      columns={columns}
                      pageSize={10} // 1ページあたりの行数
                      rowsPerPageOptions={[10]}
                      checkboxSelection={false}
                      disableSelectionOnClick
                      rowHeight={30} // 行の高さを30pxに設定
                      headerHeight={30} // ヘッダーの高さを30pxに設定
                      onRowClick={handleRowClick} // 行をクリックしたときのイベント
                    />
                  </div>

                  {/* 選択されたノウハウ情報 */}
                  {selectedKnowHow && (
                    <div className="mt-4 p-5 bg-gray-100 rounded-md border relative">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-lg font-semibold text-gray-700">
                          ナレッジ内容
                        </h4>
                      </div>

                      {/* ノウハウの詳細情報 */}
                      <p className="text-sm text-gray-800">
                        <strong>ナレッジ名:</strong> {selectedKnowHow.knowledge_name}
                      </p>
                      <p className="text-sm text-gray-800">
                        <strong>作成日:</strong> {selectedKnowHow.created_at}
                      </p>
                      <p className="text-sm text-gray-800">
                        <strong>タグ:</strong> {selectedKnowHow.tags.join(", ")}
                      </p>

                      {/* 切り替えボタン */}
                      <div className="w-full flex flex-row-reverse">
                        <button
                          className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                          onClick={toggleMarkdown}
                        >
                          {isMarkdown ? "生データ表示" : "マークダウン表示"}
                        </button>
                      </div>

                      {/* ナレッジ内容 */}
                      <div className="p-4 mt-2 bg-white border rounded-lg">
                        {isMarkdown ? (
                          <ReactMarkdown className="markdown">
                            {selectedKnowHow.knowledge_content}
                          </ReactMarkdown>
                        ) : (
                          <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                            {selectedKnowHow.knowledge_content}
                          </pre>
                        )}
                      </div>

                      {/* ノウハウ削除ボタン */}
                      <div className="mt-4">
                        <button
                          onClick={() => deleteKnowHow(selectedKnowHow._id)}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                          ノウハウ削除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default KnowHows;

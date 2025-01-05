// src/components/Sidebar.jsx

import React, { useState, useEffect, useRef } from 'react';
import { Menu, MoreHorizontal, Download } from 'lucide-react';

const Sidebar = ({
  isOpen,
  onToggle,
  directories,
  onSelectDirectory,
  selectedDirectory,
  onRequestDeleteDirectory,
  username,   // 追加: ユーザー名
  onLogout,   // 追加: ログアウトボタン押下時のハンドラ
}) => {
  const [popupDir, setPopupDir] = useState(null); // ポップアップを表示するディレクトリ名
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 }); // ポップアップの表示位置
  const popupRef = useRef(null);

  // ポップアップ領域外クリックで閉じる処理
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setPopupDir(null);
      }
    };

    if (popupDir) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [popupDir]);

  // 「…(More)」ボタンを押したときにポップアップを表示
  const handleMoreButtonClick = (event, dirName) => {
    const buttonRect = event.currentTarget.getBoundingClientRect();
    setPopupPosition({
      top: buttonRect.bottom + window.scrollY,
      left: buttonRect.left + window.scrollX,
    });
    setPopupDir(dirName);
  };

  // ディレクトリを zip でダウンロード
  const handleDownload = async (dirName) => {
    try {
      const response = await fetch(
        `http://${import.meta.env.VITE_APP_IP}:5601/download_directory?dir_name=${encodeURIComponent(dirName)}`,
        {
          method: 'GET',
          mode: 'cors',
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'ダウンロードに失敗しました');
      }

      // レスポンスを Blob として取得
      const blob = await response.blob();

      // ダウンロード用リンクを作成してクリック
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dirName}.zip`;
      document.body.appendChild(a);
      a.click();

      // 後処理
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setPopupDir(null);
    } catch (error) {
      console.error('Error downloading directory:', error);
      alert('ダウンロード中にエラーが発生しました: ' + error.message);
    }
  };

  return (
    <div
      className={`fixed top-0 left-0 h-full bg-gray-800 text-white transform ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{ width: '250px', zIndex: 1000 }}
    >
      {/* サイドバー上部 */}
      <div className="flex items-center p-4 bg-gray-900">
        <button onClick={onToggle} className="focus:outline-none text-white">
          <Menu className="h-7 w-6" />
        </button>
      </div>

      {/* ディレクトリ一覧 */}
      <div className="p-4 space-y-2 overflow-y-auto">
        {directories.length === 0 ? (
          <p>ディレクトリがありません</p>
        ) : (
          directories.map((dir) => (
            <div
              key={dir.dir_name}
              className="flex items-center justify-between relative"
            >
              <div
                className={`flex items-center justify-between flex-1 text-left px-2 py-1 rounded ${
                  dir.dir_name === selectedDirectory
                    ? 'bg-gray-600'
                    : 'hover:bg-gray-700'
                }`}
                style={{ maxWidth: '220px' }} // 文字が長い場合の折り返し対応
              >
                <button
                  onClick={() => {
                    if (dir.dir_name !== selectedDirectory) {
                      onSelectDirectory(`${username}/${dir.dir_name}`);
                    }
                  }}
                  className="text-ellipsis overflow-hidden whitespace-nowrap flex-1 text-left"
                  style={{ minWidth: 0 }}
                >
                  {dir.display_name}
                </button>
                <button
                  onClick={(event) => handleMoreButtonClick(event, dir.dir_name)}
                  className="focus:outline-none p-1 hover:bg-gray-700 rounded flex-shrink-0"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ポップアップメニュー (「保存」「削除」) */}
      {popupDir && (
        <div
          ref={popupRef}
          className="absolute bg-gray-700 rounded shadow-lg w-24"
          style={{
            top: popupPosition.top,
            left: popupPosition.left,
            zIndex: 1100,
          }}
        >
          <button
            onClick={() => handleDownload(popupDir)}
            className="w-full px-4 py-2 text-white hover:bg-gray-600 hover:rounded text-left flex items-center"
          >
            <Download className="h-4 w-4 mr-2" />
            保存
          </button>
          <button
            onClick={() => {
              onRequestDeleteDirectory(popupDir);
              setPopupDir(null);
            }}
            className="w-full px-4 py-2 text-red-500 hover:bg-gray-600 hover:rounded text-left"
          >
            削除
          </button>
        </div>
      )}

      {/* サイドバー下部にユーザー名とログアウトボタン */}
      <div className="absolute bottom-0 left-0 w-full p-4 bg-gray-900 flex items-center justify-between">
        <span className="truncate">{username}</span>
        <button
          onClick={onLogout}
          className="bg-red-600 px-3 py-1 text-white rounded"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
};

export default Sidebar;

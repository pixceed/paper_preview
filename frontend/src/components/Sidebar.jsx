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
  username,
  onLogout,
  // 修正: ファイル削除後、PaperPreview に部分更新を依頼するコールバック
  onFileDeleted,
}) => {
  const [popupDir, setPopupDir] = useState(null);
  const [popupFiles, setPopupFiles] = useState([]);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const popupRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setPopupDir(null);
        setPopupFiles([]);
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

  // ディレクトリ内ファイル一覧を取得し、popupFiles に格納
  const fetchFileList = async (dirName) => {
    try {
      const response = await fetch(
        `http://${import.meta.env.VITE_APP_IP}:5601/list_files/${username}/${encodeURIComponent(dirName)}`,
        {
          method: 'GET',
          mode: 'cors',
        }
      );
      if (!response.ok) {
        throw new Error('ファイル一覧取得に失敗しました');
      }
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setPopupFiles(data.markdown_files || []);
    } catch (error) {
      console.error('Error fetching file list:', error);
      setPopupFiles([]);
    }
  };

  // 「...」ボタン押下時、ポップアップ表示と同時にファイル一覧を取得
  const handleMoreButtonClick = async (event, dirName) => {
    const buttonRect = event.currentTarget.getBoundingClientRect();
    setPopupPosition({
      top: buttonRect.bottom + window.scrollY,
      left: buttonRect.left + window.scrollX,
    });
    setPopupDir(dirName);
    await fetchFileList(dirName);
  };

  // ZIP ダウンロード
  const handleDownload = async (dirName) => {
    try {
      const response = await fetch(
        `http://${import.meta.env.VITE_APP_IP}:5601/download_directory?username=${username}&dir_name=${encodeURIComponent(
          dirName
        )}`,
        {
          method: 'GET',
          mode: 'cors',
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'ダウンロードに失敗しました');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dirName}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setPopupDir(null);
      setPopupFiles([]);
    } catch (error) {
      console.error('Error downloading directory:', error);
      alert('ダウンロード中にエラーが発生しました: ' + error.message);
    }
  };

  // ファイル削除 (_trans.md など)
  const handleDeleteFile = async (dirName, suffix) => {
    try {
      const response = await fetch(`http://${import.meta.env.VITE_APP_IP}:5601/delete_file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          dir_name: dirName,
          suffix,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'ファイル削除に失敗しました');
      }

      // 再度ファイル一覧を取得 (ポップアップ内のボタン表示を更新)
      await fetchFileList(dirName);

      // ★★★ PaperPreview 側にも再読み込みを依頼する。
      //     ただしディレクトリ切替は行わず、ファイルの有無だけ再チェックしてほしい。
      if (typeof onFileDeleted === 'function') {
        onFileDeleted(dirName);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('削除中にエラーが発生しました: ' + error.message);
    }
  };

  // ディレクトリ削除
  const handleDeleteDirectory = (dirName) => {
    onRequestDeleteDirectory(dirName);
    setPopupDir(null);
    setPopupFiles([]);
  };

  // ポップアップメニュー内のボタン表示制御
  const hasTrans = popupFiles.some((f) => f.toLowerCase().endsWith('_trans.md'));
  const hasExplain = popupFiles.some((f) => f.toLowerCase().endsWith('_explain.md'));
  const hasThread = popupFiles.some((f) => f.toLowerCase().endsWith('_thread.md'));

  return (
    <div
      className={`fixed top-0 left-0 h-full bg-gray-800 text-white transform ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{ width: '250px', zIndex: 1000 }}
    >
      <div className="flex items-center p-4 bg-gray-900">
        <button onClick={onToggle} className="focus:outline-none text-white">
          <Menu className="h-7 w-6" />
        </button>
      </div>

      <div className="p-4 space-y-2 overflow-y-auto">
        {directories.length === 0 ? (
          <p>ディレクトリがありません</p>
        ) : (
          directories.map((dir) => {
            const fullPath = `${username}/${dir.dir_name}`;
            const isSelected = fullPath === selectedDirectory;
            return (
              <div key={dir.dir_name} className="flex items-center justify-between relative">
                <div
                  className={`flex items-center justify-between flex-1 text-left px-2 py-1 rounded ${
                    isSelected ? 'bg-gray-600' : 'hover:bg-gray-700'
                  }`}
                  style={{ maxWidth: '220px' }}
                >
                  <button
                    onClick={() => {
                      if (!isSelected) {
                        onSelectDirectory(fullPath);
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
            );
          })
        )}
      </div>

      {popupDir && (
        <div
          ref={popupRef}
          className="absolute bg-gray-700 rounded shadow-lg w-32"
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

          {hasTrans && (
            <button
              onClick={() => handleDeleteFile(popupDir, '_trans.md')}
              className="w-full px-4 py-2 text-red-400 hover:bg-gray-600 hover:rounded text-left"
            >
              翻訳削除
            </button>
          )}
          {hasExplain && (
            <button
              onClick={() => handleDeleteFile(popupDir, '_explain.md')}
              className="w-full px-4 py-2 text-red-400 hover:bg-gray-600 hover:rounded text-left"
            >
              解説削除
            </button>
          )}
          {hasThread && (
            <button
              onClick={() => handleDeleteFile(popupDir, '_thread.md')}
              className="w-full px-4 py-2 text-red-400 hover:bg-gray-600 hover:rounded text-left"
            >
              スレ削除
            </button>
          )}

          <button
            onClick={() => handleDeleteDirectory(popupDir)}
            className="w-full px-4 py-2 font-black text-red-500 hover:bg-gray-600 hover:rounded text-left"
          >
            削除
          </button>
        </div>
      )}

      <div className="absolute bottom-0 left-0 w-full p-4 bg-gray-900 flex items-center justify-between">
        <span className="truncate">{username}</span>
        <button onClick={onLogout} className="bg-red-600 px-3 py-1 text-white rounded">
          ログアウト
        </button>
      </div>
    </div>
  );
};

export default Sidebar;

// src/components/Login.jsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [username, setUsername] = useState('');
  const [showPopup, setShowPopup] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!username.trim()) {
      alert('ユーザーIDを入力してください');
      return;
    }
    try {
      // check_user API で存在確認
      const res = await fetch(`http://${import.meta.env.VITE_APP_IP}:5601/check_user?username=${encodeURIComponent(username)}`, {
        method: 'GET',
        mode: 'cors',
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'ユーザー確認に失敗しました');
      }
      const data = await res.json();
      if (data.exists) {
        // 既存ユーザー → ログイン成功
        // ここではパスワード不要なので即ログイン
        navigate(`/${username}`);
      } else {
        // 新規ユーザー → ポップアップ表示
        setShowPopup(true);
      }
    } catch (error) {
      console.error('Error checking user:', error);
      alert('ログイン中にエラーが発生しました: ' + error.message);
    }
  };

  const handleRegister = async () => {
    // create_user API
    try {
      const res = await fetch(`http://${import.meta.env.VITE_APP_IP}:5601/create_user`, {
        method: 'POST',
        mode: 'cors',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '新規登録に失敗しました');
      }
      // 登録成功なら PaperPreview 画面へ
      navigate(`/${username}`);
    } catch (error) {
      console.error('Error creating user:', error);
      alert('新規登録中にエラーが発生しました: ' + error.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white shadow-md p-8 rounded">
        <h1 className="text-2xl mb-4">ユーザーIDでログイン</h1>
        <input
          type="text"
          className="border p-2 w-full mb-4"
          placeholder="ユーザーID"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded w-full"
          onClick={handleLogin}
        >
          ログイン
        </button>
      </div>

      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-4 rounded shadow-md">
            <p className="mb-4">未登録ユーザーです。新規登録しますか？</p>
            <div className="flex justify-end space-x-4">
              <button
                className="bg-gray-300 px-3 py-1 rounded"
                onClick={() => setShowPopup(false)}
              >
                キャンセル
              </button>
              <button
                className="bg-blue-500 text-white px-3 py-1 rounded"
                onClick={handleRegister}
              >
                登録
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;

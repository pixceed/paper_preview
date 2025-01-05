// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PaperPreview from './components/PaperPreview';
import Login from './components/Login';

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* ログイン画面 */}
        <Route path="/login" element={<Login />} />

        {/* PaperPreview: ユーザーIDのパラメータを受け取り表示 */}
        <Route path="/:username" element={<PaperPreview />} />

        {/* その他の場合は /login へリダイレクト */}
        <Route path="*" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;

// src/components/Login.jsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const Login = () => {
  const [username, setUsername] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const navigate = useNavigate();

  // ログインボタン押下
  const handleLogin = async () => {
    if (!username.trim()) {
      alert('ユーザーIDを入力してください');
      return;
    }
    try {
      // check_user API で存在確認
      const res = await fetch(
        `http://${import.meta.env.VITE_APP_IP}:5601/check_user?username=${encodeURIComponent(username)}`, 
        {
          method: 'GET',
          mode: 'cors',
        }
      );
      if (res.status === 403) {
        alert('このユーザーIDは許可されていません');
        return;
      }
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'ユーザー確認に失敗しました');
      }
      const data = await res.json();
      if (data.exists) {
        // 既存ユーザー → ログイン成功
        // → ログインフラグとログインユーザー名を保存してPaperPreviewへ
        sessionStorage.setItem('isLoggedIn', 'true');
        sessionStorage.setItem('loggedInUser', username);
        navigate(`/${username}`);
      } else {
        // 新規ユーザー → ダイアログ表示
        setShowDialog(true);
      }
    } catch (error) {
      console.error('Error checking user:', error);
      alert('ログイン中にエラーが発生しました: ' + error.message);
    }
  };

  // 新規ユーザー登録
  const handleRegister = async () => {
    try {
      const res = await fetch(`http://${import.meta.env.VITE_APP_IP}:5601/create_user`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (res.status === 403) {
        alert('このユーザーIDは許可されていません');
        setShowDialog(false);
        return;
      }
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '新規登録に失敗しました');
      }
      // 登録成功 → ログインフラグとログインユーザー名を保存してPaperPreviewへ
      sessionStorage.setItem('isLoggedIn', 'true');
      sessionStorage.setItem('loggedInUser', username);
      navigate(`/${username}`);
    } catch (error) {
      console.error('Error creating user:', error);
      alert('新規登録中にエラーが発生しました: ' + error.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md p-6 shadow-lg mb-20">
        <div className='flex justify-center pt-5 pb-5 pr-3'>
          <img src="binoculars_logo2.png" alt="Synapse Logo" className="h-10 w-10 mr-2 mt-0.5" />
          <h1 className="text-4xl font-semibold text-center mb-6">Survey Copilot</h1>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
          className="space-y-4"
        >
          <div className='pb-3'>
            <Label htmlFor="username" className="block text-sm font-medium text-gray-700">
              ユーザーID
            </Label>
            <Input
              id="username"
              type="text"
              placeholder="社員番号を入力してください"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full"
              required
            />
          </div>
          <Button type="submit" className="w-full">
            ログイン/新規作成
          </Button>
        </form>
      </Card>

      {/* 新規ユーザー登録ダイアログ */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新規ユーザー登録</DialogTitle>
            <DialogDescription>
              未登録のユーザーです。新規登録を行いますか？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              キャンセル
            </Button>
            <Button onClick={handleRegister}>登録</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;

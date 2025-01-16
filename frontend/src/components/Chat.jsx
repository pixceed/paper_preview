// src/components/Chat.jsx

import React, { useState, useRef, useEffect } from 'react';
import { Send, Image, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const Chat = ({
  chat,
  handleSend,
  isAssistantTyping,
  chatSessions,
  restoredSessionId,
  handleSelectSession,
  handleChatReset,
}) => {
  // チャット内部で入力テキストと画像を管理
  const [localMessage, setLocalMessage] = useState('');
  const [localImages, setLocalImages] = useState([]);

  const chatScrollRef = useRef(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chat, isAssistantTyping]);

  // 画像アップロード
  const handleImageUpload = (e) => {
    const files = e.target.files;
    if (files) {
      const newImages = Array.from(files).map((file) => URL.createObjectURL(file));
      setLocalImages((prev) => [...prev, ...newImages]);
    }
  };

  // 画像削除
  const handleRemoveImage = (index) => {
    setLocalImages((prev) => prev.filter((_, i) => i !== index));
  };

  // 送信クリック
  const handleSendClick = () => {
    handleSend(localMessage, localImages);
    setLocalMessage('');
    setLocalImages([]);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="pb-[10px] flex justify-between items-center">
        <Select
          onValueChange={(val) => handleSelectSession(val)}
          value={restoredSessionId ? String(restoredSessionId) : ''}
        >
          <SelectTrigger className="w-2/3 bg-white font-bold">
            {restoredSessionId ? (
              <SelectValue>
                {chatSessions.find((s) => s.id === Number(restoredSessionId))?.created_at || "チャット履歴なし"}
              </SelectValue>
            ) : (
              <SelectValue placeholder={chatSessions.length > 0 ? "チャット履歴を選択" : "チャット履歴なし"} />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {chatSessions.map((session) => (
                <SelectItem key={session.id} value={String(session.id)}>
                  {session.created_at}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <div>
          <Button variant="outline" size="sm" onClick={handleChatReset}>
            リセット
          </Button>
        </div>
      </div>

      <Card className="h-[calc(100%-2.6rem)] flex flex-col">
        <CardContent className="flex-1 overflow-auto p-4" ref={chatScrollRef}>
          <div className="space-y-4">
            {chat.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.type === 'text' ? (
                  <div
                    className={`rounded-lg px-4 py-2 max-w-[80%] ${
                      msg.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-black'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                ) : (
                  <img
                    src={msg.content}
                    alt="Image"
                    className="rounded-lg max-w-[80%] border"
                  />
                )}
              </div>
            ))}
            {isAssistantTyping && (
              <div className="flex justify-start items-center mt-4">
                <Loader2 className="animate-spin mr-2 h-5 w-5 text-gray-500" />
                <div>回答生成中...</div>
              </div>
            )}
          </div>
        </CardContent>

        <div className="p-4 border-t">
          {localImages.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {localImages.map((image, index) => (
                <div key={index} className="relative">
                  <img
                    src={image}
                    alt={`Pending ${index}`}
                    className="rounded-lg max-w-full max-h-40 border"
                  />
                  <button
                    onClick={() => handleRemoveImage(index)}
                    className="absolute top-1 right-1 bg-white rounded-full p-1 shadow"
                  >
                    <X className="h-4 w-4 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              value={localMessage}
              onChange={(e) => setLocalMessage(e.target.value)}
              placeholder="メッセージを入力..."
              className="resize-none"
              rows={3}
              onKeyDown={(e) => {
                // IME 確定前の Enter はスルー
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendClick();
                }
              }}
            />
            <div className="flex flex-col gap-2">
              <Button
                className="self-end"
                size="icon"
                onClick={() => document.getElementById('image-input').click()}
              >
                <Image className="h-4 w-4" />
              </Button>
              <Button onClick={handleSendClick} className="self-end" size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <input
              id="image-input"
              type="file"
              accept="image/*"
              className="hidden"
              multiple
              onChange={handleImageUpload}
            />
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Chat;

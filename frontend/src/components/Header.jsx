// src/components/PaperPreview/Header.jsx

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Menu, Upload, Link, BookOpenText } from 'lucide-react';

const Header = ({ onPdfSelect, onMenuClick, sidebarOpen }) => {
  const [pdfUrl, setPdfUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  // クリックでファイルを選択した場合に呼ばれる処理
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  // ドラッグオーバー時にイベントをキャンセルしておかないと、onDropが発火しない
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // ドロップしたファイルを選択状態にする処理
  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      // PDFを強制する場合は、以下のようにチェックする
      if (file.type !== 'application/pdf') {
        alert('PDFファイルをドロップしてください');
        return;
      }
      setSelectedFile(file);
    }
  };

  // ファイルをクリアする処理
  const handleClearFile = () => {
    setSelectedFile(null);
  };

  return (
    <header className="bg-white border-b w-full flex items-center">
      {/* サイドバーが閉じている場合のみメニューボタンを表示 */}
      {!sidebarOpen && (
        <button
          onClick={onMenuClick}
          className="p-4 focus:outline-none text-gray-500"
        >
          <Menu className="h-6 w-6" />
        </button>
      )}
      <div className="px-4 py-3 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex">
            <img
              src="binoculars_logo2.png"
              alt="Synapse Logo"
              className="h-8 w-8 mr-2 mt-0.5"
            />
            <h1 className="text-2xl font-bold text-primary">Survey Copilot</h1>
          </div>
          <Tabs defaultValue="file" className="w-[600px]">
            <div className="flex items-center gap-4">
              <TabsList className="h-9 p-1 bg-muted">
                <TabsTrigger
                  value="file"
                  className="flex items-center gap-2 px-3 text-sm"
                >
                  <Upload className="h-4 w-4" />
                  ファイル選択
                </TabsTrigger>
                <TabsTrigger
                  value="url"
                  className="flex items-center gap-2 px-3 text-sm"
                >
                  <Link className="h-4 w-4" />
                  URL入力
                </TabsTrigger>
              </TabsList>

              <div className="flex-1">
                {/* ファイル選択用タブ */}
                <TabsContent value="file" className="mt-0">
                  <div className="flex items-center gap-2">
                    {/*
                      クリックでファイル選択ダイアログを開き、
                      ドラッグ＆ドロップにも対応する領域。
                      ファイル名表示＋右側にクリアボタン（×）。
                    */}
                    <div
                      className="w-[280px] h-9 rounded-md border border-input bg-background px-3 py-1 text-sm
                                 cursor-pointer flex items-center justify-between overflow-hidden text-ellipsis
                                 whitespace-nowrap hover:bg-gray-50"
                      onClick={() => document.getElementById('file-input').click()}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    >
                      <span>
                        {selectedFile
                          ? selectedFile.name
                          : 'ここにPDFをドロップ、またはクリックして選択'}
                      </span>
                      {/* PDFファイルが選択されている場合のみ × ボタンを表示 */}
                      {selectedFile && selectedFile.type === 'application/pdf' && (
                        <button
                          className="ml-2 text-gray-500 hover:text-gray-700"
                          onClick={(e) => {
                            e.stopPropagation(); // 親要素のクリックイベントを止める
                            handleClearFile();
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    {/* 実際のinputは非表示にして、上のdivにクリックイベントをつけている */}
                    <input
                      id="file-input"
                      type="file"
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    {/* 「読む」ボタン */}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-9 px-3"
                      onClick={() => {
                        if (selectedFile) {
                          // onPdfSelectの引数としてtypeとfileを渡す
                          onPdfSelect({
                            type: 'file',
                            file: selectedFile,
                          });
                        } else {
                          alert('ファイルが選択されていません');
                        }
                      }}
                    >
                      <BookOpenText className="h-4 w-4 mr-2" />
                      読む
                    </Button>
                  </div>
                </TabsContent>

                {/* URL入力用タブ */}
                <TabsContent value="url" className="mt-0">
                  <div className="flex items-center gap-2">
                    <Input
                      type="url"
                      placeholder="PDF URL を入力"
                      value={pdfUrl}
                      onChange={(e) => setPdfUrl(e.target.value)}
                      className="w-full h-9"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-9 px-3"
                      onClick={() => {
                        if (pdfUrl) {
                          onPdfSelect({ type: 'url', url: pdfUrl });
                        } else {
                          alert('URLを入力してください');
                        }
                      }}
                    >
                      <BookOpenText className="h-4 w-4 mr-2" />
                      読む
                    </Button>
                  </div>
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </div>
      </div>
    </header>
  );
};

export default Header;

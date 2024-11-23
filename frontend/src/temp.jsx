// src/App.jsx
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  Send,
  Image,
  X,
  Link,
  Upload,
  BookOpenText,
  ZoomIn,
  ZoomOut,
  Loader2,
  Menu, // 追加
} from 'lucide-react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Document, Page, pdfjs } from 'react-pdf';

import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

import Split from 'react-split';

// PDF.js のワーカーを設定
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';

const Sidebar = ({ isOpen, onToggle }) => {
  return (
    <div
      className={`fixed top-0 left-0 h-full bg-gray-800 text-white transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{ width: '250px' }}
    >
      <div className="flex items-center p-4 bg-gray-900">
        <button onClick={onToggle} className="focus:outline-none text-white">
          <Menu className="h-7 w-6" />
        </button>

      </div>
      <div className="p-4 space-y-2">
        <p>コンテンツ1</p>
        <p>コンテンツ2</p>
        <p>コンテンツ3</p>
      </div>
    </div>
  );
};

const Header = ({ onPdfSelect, onMenuClick, sidebarOpen }) => {
  const [pdfUrl, setPdfUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  return (
    <header className="bg-white border-b w-full flex items-center">
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
          <h1 className="text-2xl font-bold text-primary">論文読み読みくん</h1>
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
                <TabsContent value="file" className="mt-0">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-[280px] h-9 rounded-md border border-input bg-background px-3 py-1 text-sm cursor-pointer flex items-center"
                      onClick={() =>
                        document.getElementById('file-input').click()
                      }
                    >
                      {selectedFile
                        ? selectedFile.name
                        : 'ファイルが選択されていません'}
                    </div>
                    <input
                      id="file-input"
                      type="file"
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-9 px-3"
                      onClick={() => {
                        if (selectedFile) {
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

const App = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState([]);
  const [pendingImages, setPendingImages] = useState([]);

  const [pdfToDisplay, setPdfToDisplay] = useState(null);
  const [numPages, setNumPages] = useState(0);

  // サイドバーの状態を追加
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // PDF表示エリアの参照と幅の状態
  const pdfContainerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(null);

  // ズームレベルの状態
  const [scale, setScale] = useState(1.0);

  // ローディング状態
  const [loading, setLoading] = useState(false);

  // コンテナの幅を更新する関数
  const updateContainerWidth = () => {
    if (pdfContainerRef.current) {
      const width = pdfContainerRef.current.offsetWidth;
      if (width > 0) {
        setContainerWidth(width);
      }
    }
  };

  // 初回レンダリングと依存関係の変更時に幅を更新
  useLayoutEffect(() => {
    updateContainerWidth();
  }, [pdfToDisplay]);

  // ウィンドウサイズの変更時に幅を更新
  useEffect(() => {
    window.addEventListener('resize', updateContainerWidth);
    return () => {
      window.removeEventListener('resize', updateContainerWidth);
    };
  }, []);

  const handleSend = () => {
    if (message.trim() || pendingImages.length > 0) {
      const newMessages = [];
      if (message.trim()) {
        newMessages.push({ role: 'user', type: 'text', content: message });
      }
      if (pendingImages.length > 0) {
        pendingImages.forEach((image) => {
          newMessages.push({ role: 'user', type: 'image', content: image });
        });
        setPendingImages([]);
      }
      setChat([...chat, ...newMessages]);
      setMessage('');
    }
  };

  const handleImageUpload = (e) => {
    const files = e.target.files;
    if (files) {
      const newImages = Array.from(files).map((file) =>
        URL.createObjectURL(file)
      );
      setPendingImages([...pendingImages, ...newImages]);
    }
  };

  const handleRemoveImage = (index) => {
    setPendingImages(pendingImages.filter((_, i) => i !== index));
  };

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    updateContainerWidth(); // PDF がロードされたら幅を更新
  }

  // ズームイン・ズームアウトのハンドラー
  const handleZoomIn = () => {
    setScale((prevScale) => Math.min(prevScale + 0.2, 3.0)); // 最大3倍まで
  };

  const handleZoomOut = () => {
    setScale((prevScale) => Math.max(prevScale - 0.2, 0.5)); // 最小0.5倍まで
  };

  // チャットのリセットハンドラー
  const handleChatReset = () => {
    setChat([]);
  };

  // PDFのテキストを取得するuseEffect
  useEffect(() => {
    if (pdfToDisplay) {
      const processPdf = async () => {
        try {
          setLoading(true);
          let response;
          if (pdfToDisplay.type === 'file') {
            const formData = new FormData();
            formData.append('file', pdfToDisplay.file);

            response = await fetch('http://127.0.0.1:5601/pdf2markdown', {
              method: 'POST',
              body: formData,
              mode: 'cors',
            });
          } else if (pdfToDisplay.type === 'url') {
            response = await fetch('http://127.0.0.1:5601/pdf2markdown', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ url: pdfToDisplay.url }),
              mode: 'cors',
            });
          }

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to process PDF');
          }

          const data = await response.json();
          setContent(data.text);
        } catch (error) {
          console.error('Error processing PDF:', error);
          alert('PDFの処理中にエラーが発生しました: ' + error.message);
        } finally {
          setLoading(false);
        }
      };

      processPdf();
    }
  }, [pdfToDisplay]);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  return (
    <div
      className={`min-h-screen bg-gray-100 transition-transform duration-300 ${
        sidebarOpen ? 'pl-[250px]' : ''
      }`}
    >
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
      <Header
        onPdfSelect={(pdf) => console.log(pdf)}
        onMenuClick={toggleSidebar}
        sidebarOpen={sidebarOpen}
      />
      <main className="mx-auto p-4 h-[calc(100vh-4rem)]">
      <Split
            className="split h-full flex"
            gutterSize={12}
            sizes={[30, 40, 30]} // デフォルトの比率
            minSize={200}
            expandToMin={false}
            gutterAlign="center"
            snapOffset={30}
            dragInterval={1}
            direction="horizontal"
            cursor="col-resize"
          >
            {/* 左ペイン（PDFビューア） */}
            <div className="flex flex-col">
              {pdfToDisplay ? (
                <>
                  <div className="flex justify-end mb-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleZoomOut}
                      className="mr-2"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleZoomIn}>
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </div>
                  <div
                    className="rounded-lg h-full overflow-auto border"
                    ref={pdfContainerRef}
                  >
                    <Document
                      file={
                        pdfToDisplay.type === 'url'
                          ? pdfToDisplay.url
                          : pdfToDisplay.type === 'file'
                          ? pdfToDisplay.file
                          : null
                      }
                      onLoadSuccess={onDocumentLoadSuccess}
                    >
                      {numPages > 0 &&
                        containerWidth &&
                        Array.from({ length: numPages }, (_, index) => (
                          <Page
                            key={`page_${index + 1}`}
                            pageNumber={index + 1}
                            width={containerWidth * scale}
                          />
                        ))}
                    </Document>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-lg h-full mt-11 flex items-center justify-center border">
                  PDFが選択されていません
                </div>
              )}
            </div>

            {/* 中央ペイン（マークダウンエディタ/プレビュー） */}
            <div className="flex flex-col">
              <Tabs defaultValue="preview" className="h-full pb-3">
                <div className="flex justify-end mb-2">
                  <TabsList>
                    <TabsTrigger value="edit">編集モード</TabsTrigger>
                    <TabsTrigger value="preview">プレビューモード</TabsTrigger>
                  </TabsList>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center">
                      <Loader2 className="animate-spin mr-2 h-5 w-5 text-gray-500" />
                      <div>PDFからマークダウンに変換中...</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <TabsContent
                      value="edit"
                      className="h-[calc(100%-2rem)] w-full"
                    >
                      <Textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="bg-white h-full resize-none font-mono"
                        placeholder="マークダウンを入力してください..."
                      />
                    </TabsContent>

                    <TabsContent
                      value="preview"
                      className="h-[calc(100%-2rem)] w-full"
                    >
                      <Card className="h-full overflow-auto">
                        <CardContent className="max-w-none p-4">
                          <ReactMarkdown
                            className="markdown"
                            remarkPlugins={[remarkGfm]}
                          >
                            {content}
                          </ReactMarkdown>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </>
                )}
              </Tabs>
            </div>

            {/* 右ペイン（チャットエリア） */}
            <div className="flex flex-col">
              {/* リセットボタンを追加 */}
              <div className="pb-3 flex justify-end items-center">
                <Button variant="outline" size="sm" onClick={handleChatReset}>
                  リセット
                </Button>
              </div>

              <Card className="h-[calc(100%-2.6rem)] flex flex-col">
                <CardContent className="flex-1 overflow-auto p-4">
                  <div className="space-y-4">
                    {chat.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {msg.type === 'text' ? (
                          <div className="rounded-lg px-4 py-2 max-w-[80%] bg-primary text-primary-foreground">
                            <div className="whitespace-pre-wrap">
                              {msg.content}
                            </div>
                          </div>
                        ) : (
                          <img
                            src={msg.content}
                            alt="Uploaded"
                            className="rounded-lg max-w-[80%] border"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>

                <div className="p-4 border-t">
                  {pendingImages.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {pendingImages.map((image, index) => (
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
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="メッセージを入力..."
                      className="resize-none"
                      rows={3}
                    />

                    <div className="flex flex-col gap-2">
                      <Button
                        className="self-end"
                        size="icon"
                        onClick={() =>
                          document.getElementById('image-input').click()
                        }
                      >
                        <Image className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={handleSend}
                        className="self-end"
                        size="icon"
                      >
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
          </Split>
      </main>
    </div>
  );
};

export default App;

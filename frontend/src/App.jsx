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
  Menu,
  MoreHorizontal,
} from 'lucide-react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Document, Page, pdfjs } from 'react-pdf';

import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

import Split from 'react-split';

// PDF.js のワーカーを設定
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';

// ヘルパー関数: fetch with timeout
const fetchWithTimeout = (url, options, timeout = 60000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error('リクエストがタイムアウトしました。後でもう一度お試しください。')
      );
    }, timeout);

    fetch(url, options)
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

// 確認ダイアログコンポーネントの定義
const ConfirmationDialog = ({ isOpen, message, onCancel, onConfirm }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-80">
        <h2 className="text-lg font-semibold mb-4">確認</h2>
        <p className="mb-6">{message}</p>
        <div className="flex justify-end gap-4">
          <Button variant="secondary" onClick={onCancel}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            削除する
          </Button>
        </div>
      </div>
    </div>
  );
};

// サイドバーコンポーネントの定義
const Sidebar = ({
  isOpen,
  onToggle,
  directories,
  onSelectDirectory,
  selectedDirectory,
  onRequestDeleteDirectory,
}) => {
  const [popupDir, setPopupDir] = useState(null); // ポップアップを表示するディレクトリ
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 }); // ポップアップの位置を動的に管理
  const popupRef = useRef(null); // ポップアップの参照

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target)
      ) {
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

  const handleMoreButtonClick = (event, dirName) => {
    const buttonRect = event.currentTarget.getBoundingClientRect();
    setPopupPosition({
      top: buttonRect.bottom + window.scrollY, // ボタンの下端
      left: buttonRect.left + window.scrollX, // ボタンの左端
    });
    setPopupDir(dirName); // 表示するディレクトリを設定
  };

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
          directories.map((dir) => (
            <div key={dir.dir_name} className="flex items-center justify-between relative">

              <div
                className={`flex items-center justify-between flex-1 text-left px-2 py-1 rounded ${
                  dir.dir_name === selectedDirectory
                    ? 'bg-gray-600'
                    : 'hover:bg-gray-700'
                }`}
              >
                <button
                  key={dir.dir_name}
                  onClick={() => {
                    if (dir.dir_name !== selectedDirectory) {
                      onSelectDirectory(dir.dir_name);
                    }
                  }}

                >
                  {dir.display_name}
                </button>
                <button
                  onClick={(event) => handleMoreButtonClick(event, dir.dir_name)}
                  className="focus:outline-none p-1 hover:bg-gray-700 rounded"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>

            </div>
          ))
        )}
      </div>

      {/* ポップアップ */}
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
    </div>
  );
};

// ヘッダーコンポーネントの定義
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
          <h1 className="text-2xl font-bold text-primary">Smart Scholar Survey</h1>
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
  const [selectedDirectory, setSelectedDirectory] = useState(null);
  const [numPages, setNumPages] = useState(0);

  // サイドバーコンポーネントのディレクトリ一覧
  const [directories, setDirectories] = useState([]);

  // 最新のディレクトリ名を保持するための状態
  const [latestDirectory, setLatestDirectory] = useState(null);

  // PDF表示エリアの参照と幅の状態
  const pdfContainerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(null);

  // ズームレベルの状態
  const [scale, setScale] = useState(1.0);

  // ローディング状態
  const [loading, setLoading] = useState(false);

  // マークダウンのローディング状態
  const [markdownLoading, setMarkdownLoading] = useState(false);

  // マークダウンのエラー状態
  const [markdownError, setMarkdownError] = useState('');

  // 進捗状況の状態
  const [processingStatus, setProcessingStatus] = useState('');

  // 中央ペインのスクロール用の参照（プレビューモード専用）
  const previewContainerRef = useRef(null);

  // 逐次的な表示かどうかを管理する状態
  const [isAppending, setIsAppending] = useState(false);

  // 翻訳ボタンの状態
  const [showTranslateButton, setShowTranslateButton] = useState(false);
  const [showJapaneseButton, setShowJapaneseButton] = useState(false);

  // 現在表示しているマークダウンファイルの種類（'origin' または 'trans'）
  const [currentMarkdownType, setCurrentMarkdownType] = useState('origin');

  // baseFileNameを保持
  const [baseFileName, setBaseFileName] = useState('');

  // 編集モードと変更状態を追跡
  const [activeTab, setActiveTab] = useState('preview'); // 'edit' または 'preview'
  const [isModified, setIsModified] = useState(false); // テキストが変更されたか

  // 確認ダイアログ用の状態
  const [confirmDeleteDir, setConfirmDeleteDir] = useState(null); // 削除確認対象のディレクトリ

  // エージェントの状態を保持
  const [agentState, setAgentState] = useState(null);

  const [chatLoading, setChatLoading] = useState(false); // チャットのローディング状態

  const [isAssistantTyping, setIsAssistantTyping] = useState(false); // アシスタントが入力中かどうか

  // コンテナの幅を更新する関数
  const updateContainerWidth = () => {
    if (pdfContainerRef.current) {
      const width = pdfContainerRef.current.offsetWidth;
      if (width > 0) {
        setContainerWidth(width);
      }
    }
  };

  // fetchDirectories 関数を useEffect の外に定義
  const fetchDirectories = async () => {
    try {
      const response = await fetchWithTimeout(
        'http://127.0.0.1:5601/list_contents',
        {
          method: 'GET',
          mode: 'cors',
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'ディレクトリの取得に失敗しました');
      }

      const data = await response.json();
      setDirectories(data.directories);
      console.log('Fetched directories:', data.directories);
    } catch (error) {
      console.error('Error fetching directories:', error);
      alert('ディレクトリの取得中にエラーが発生しました: ' + error.message);
    }
  };

  // 初回レンダリングと依存関係の変更時に幅を更新
  useLayoutEffect(() => {
    updateContainerWidth();
  }, [pdfToDisplay, selectedDirectory]);

  // ウィンドウサイズの変更時に幅を更新
  useEffect(() => {
    window.addEventListener('resize', updateContainerWidth);
    return () => {
      window.removeEventListener('resize', updateContainerWidth);
    };
  }, []);

  // サイドバーのディレクトリ一覧を取得するuseEffect（初回のみ）
  useEffect(() => {
    fetchDirectories();
  }, []);

  // チャットのリセットハンドラー
  const handleChatReset = async () => {
    if (!selectedDirectory) {
      alert('ディレクトリが選択されていません');
      return;
    }
    await fetchAgentState(selectedDirectory);
    setChat([]);
    console.log('Chat has been reset.');
  };

  // fetchAgentState 関数を定義
  const fetchAgentState = async (dirName) => {
    try {
      const response = await fetch(
        `http://127.0.0.1:5601/initialize_state?input_dir=${dirName}`,
        {
          method: 'GET',
          mode: 'cors',
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'エージェントの初期化に失敗しました');
      }

      const data = await response.json();
      setAgentState(data);

      // チャットをリセット（初期化）
      setChat([]);

      // エージェントの最初のメッセージを除外
      // 必要に応じて初期メッセージを追加する場合はここで処理
    } catch (error) {
      console.error('Error initializing agent state:', error);
      alert('エージェントの初期化中にエラーが発生しました: ' + error.message);
    }
  };

  const handleSend = async () => {
    if (message.trim() || pendingImages.length > 0) {
      if (!agentState) {
        alert('エージェントが初期化されていません');
        return;
      }

      // ユーザーメッセージを準備
      const userMessages = [];

      if (message.trim()) {
        userMessages.push({ role: 'user', content: message });
      }

      // ユーザーメッセージをチャットに追加
      setChat((prevChat) => [
        ...prevChat,
        { role: 'user', type: 'text', content: message },
      ]);

      setMessage(''); // 入力欄をクリア

      // エージェント状態を更新
      const newAgentState = { ...agentState };
      userMessages.forEach((msg) => {
        newAgentState.messages.push(msg);
      });

      try {
        setChatLoading(true); // ローディング状態を開始
        setIsAssistantTyping(true); // アシスタントが入力中

        const response = await fetch('http://127.0.0.1:5601/scholar_agent', {
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            state: newAgentState,
            user_input: message,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'エージェントからの応答取得に失敗しました');
        }

        const data = await response.json();

        // エージェント状態を更新
        setAgentState(data.state);

        // 新しいアシスタントのメッセージを取得
        const assistantMessage = data.state.messages[data.state.messages.length - 1];

        // アシスタントのメッセージをチャットに追加
        setChat((prevChat) => [
          ...prevChat,
          {
            role: assistantMessage.role,
            type: 'text',
            content: assistantMessage.content,
          },
        ]);

        setPendingImages([]); // 画像をクリア（必要に応じて）

      } catch (error) {
        console.error('Error during chat:', error);
        alert('チャット中にエラーが発生しました: ' + error.message);
      } finally {
        setChatLoading(false); // ローディング状態を終了
        setIsAssistantTyping(false); // アシスタントの入力終了
      }
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

  const handlePaste = (e) => {
    const items = e.clipboardData.items;
    const images = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          images.push(URL.createObjectURL(file));
        }
      }
    }
    if (images.length > 0) {
      setPendingImages([...pendingImages, ...images]);
    }
  };

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    updateContainerWidth(); // PDF がロードされたら幅を更新
    console.log(`Loaded PDF with ${numPages} pages.`);
  }

  // ズームイン・ズームアウトのハンドラー
  const handleZoomIn = () => {
    setScale((prevScale) => Math.min(prevScale + 0.2, 3.0)); // 最大3倍まで
    console.log(`Zoomed in to scale: ${scale + 0.2}`);
  };

  const handleZoomOut = () => {
    setScale((prevScale) => Math.max(prevScale - 0.2, 0.5)); // 最小0.5倍まで
    console.log(`Zoomed out to scale: ${scale - 0.2}`);
  };

  // contentが更新されたときにスクロール位置を制御
  useEffect(() => {
    if (previewContainerRef.current) {
      if (isAppending) {
        // 逐次的に追加されている場合は一番下にスクロール
        previewContainerRef.current.scrollTop = previewContainerRef.current.scrollHeight;
      } else {
        // 一括で読み込まれた場合は一番上にスクロール
        previewContainerRef.current.scrollTop = 0;
      }
    }
  }, [content, isAppending]);

  // PDF処理用のuseEffect
  useEffect(() => {
    const processPdf = async () => {
      if (!pdfToDisplay) return;

      if (pdfToDisplay.type === 'file' || pdfToDisplay.type === 'url') {
        try {
          setLoading(true);
          setMarkdownLoading(true);
          setMarkdownError('');
          setContent(''); // マークダウン内容をリセット
          setNumPages(0); // ページ数をリセット
          setScale(1.0); // ズームをリセット
          setProcessingStatus(''); // 進捗状況をリセット
          setShowTranslateButton(false);
          setShowJapaneseButton(false);
          setCurrentMarkdownType('origin');
          setBaseFileName('');
          setAgentState(null); // エージェント状態をリセット

          const url = 'http://127.0.0.1:5601/pdf2markdown';
          let options = {
            method: 'POST',
            mode: 'cors',
          };

          if (pdfToDisplay.type === 'file') {
            const formData = new FormData();
            formData.append('file', pdfToDisplay.file);
            options.body = formData;
          } else if (pdfToDisplay.type === 'url') {
            options.headers = {
              'Content-Type': 'application/json',
            };
            options.body = JSON.stringify({ url: pdfUrl });
          }

          console.log('Starting PDF processing...');

          const response = await fetch(url, options);

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'PDFの処理に失敗しました');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');

          let receivedDirName = '';
          let receivedBaseFileName = '';
          let inLLMOutput = false;

          setIsAppending(true); // 逐次的な追加を開始

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n\n');

            for (const line of lines) {
              if (line.startsWith('data:')) {
                const dataContent = line.replace('data: ', '');
                try {
                  const data = JSON.parse(dataContent);

                  if (data.error) {
                    throw new Error(data.error);
                  }

                  if (data.status) {
                    console.log('Status:', data.status);
                    // フロントエンドでステータスを表示するために、状態を更新
                    setProcessingStatus(data.status);
                  }

                  if (data.llm_output) {
                    console.log('LLM_OUTPUT:', data.llm_output);
                    if (data.llm_output === 'start') {
                      inLLMOutput = true;
                      setContent(''); // マークダウン内容をリセット
                    } else if (data.llm_output === 'end') {
                      inLLMOutput = false;
                      setIsAppending(false); // 逐次的な追加を終了
                      setMarkdownLoading(false); // LLM出力終了時にロード状態を解除
                      setProcessingStatus(''); // 進捗状況をリセット
                      // 翻訳済みファイルの存在をチェック
                      if (data.translation_exists) {
                        setShowJapaneseButton(true);
                        setShowTranslateButton(false);
                      } else {
                        setShowJapaneseButton(false);
                        setShowTranslateButton(true);
                      }
                      setCurrentMarkdownType('origin');
                    } else if (inLLMOutput) {
                      // LLMの出力を逐次的に追加
                      setContent((prevContent) => prevContent + data.llm_output);
                    }
                  }

                  if (data.dir_name) {
                    receivedDirName = data.dir_name;
                    receivedBaseFileName = data.base_file_name;
                  }
                } catch (e) {
                  console.error('Error parsing data:', e);
                }
              }
            }
          }

          const dirName = receivedDirName;
          const baseFileName = receivedBaseFileName;

          if (!dirName) throw new Error('ディレクトリ名が取得できませんでした');

          console.log('Directory created:', dirName);

          // PDFファイル一覧を取得
          const pdfFileResponse = await fetchWithTimeout(
            `http://127.0.0.1:5601/list_files/${dirName}`,
            {
              method: 'GET',
              mode: 'cors',
            }
          );

          if (!pdfFileResponse || !pdfFileResponse.ok) {
            const errorData = pdfFileResponse
              ? await pdfFileResponse.json()
              : {};
            throw new Error(
              errorData.error || 'ディレクトリ内のファイル一覧の取得に失敗しました'
            );
          }

          const pdfFilesData = await pdfFileResponse.json();
          const pdfFileName = pdfFilesData.pdf_file;
          const markdownFiles = pdfFilesData.markdown_files;

          if (!pdfFileName) {
            throw new Error('PDFファイル名が取得できませんでした');
          }

          console.log('PDF file found:', pdfFileName);

          // PDFのURLを設定
          const newPdfToDisplay = {
            type: 'saved',
            url: `http://127.0.0.1:5601/contents/${dirName}/${pdfFileName}`,
          };
          setPdfToDisplay(newPdfToDisplay);

          // 最新ディレクトリを設定
          setLatestDirectory(dirName);

          // サイドバーのディレクトリ一覧を更新
          await fetchDirectories();

          // 最新ディレクトリを選択
          setSelectedDirectory(dirName);

          // baseFileNameを設定
          setBaseFileName(baseFileName);

          // 翻訳済みファイルの存在をチェック
          const transMarkdownFile = markdownFiles.find((name) =>
            name.endsWith('_trans.md')
          );

          if (transMarkdownFile) {
            setShowJapaneseButton(true);
            setShowTranslateButton(false);
          } else {
            setShowJapaneseButton(false);
            setShowTranslateButton(true);
          }

          // エージェント状態を取得
          await fetchAgentState(dirName);
        } catch (error) {
          console.error('Error processing PDF:', error);
          alert('処理中にエラーが発生しました: ' + error.message);
          setMarkdownLoading(false);
          setIsAppending(false); // エラー発生時にも追加を終了
        } finally {
          setLoading(false);
        }
      }
    };

    processPdf();
  }, [pdfToDisplay]);

  // ディレクトリ選択時のuseEffect
  useEffect(() => {
    const processDirectory = async () => {
      if (!selectedDirectory) return;

      try {
        setLoading(true);
        setMarkdownLoading(true);
        setMarkdownError('');
        setContent(''); // マークダウン内容をリセット
        setNumPages(0); // ページ数をリセット
        setScale(1.0); // ズームをリセット
        setProcessingStatus(''); // 進捗状況をリセット
        setIsAppending(false); // 一括で読み込むため追加を無効化
        setShowTranslateButton(false);
        setShowJapaneseButton(false);
        setCurrentMarkdownType('origin');
        setBaseFileName('');
        setAgentState(null); // エージェント状態をリセット

        const dirName = selectedDirectory;

        console.log('Selected directory:', dirName);

        // ディレクトリ内のマークダウンファイルとPDFファイル一覧を取得
        const filesResponse = await fetchWithTimeout(
          `http://127.0.0.1:5601/list_files/${dirName}`,
          {
            method: 'GET',
            mode: 'cors',
          }
        );

        if (!filesResponse || !filesResponse.ok) {
          const errorData = filesResponse ? await filesResponse.json() : {};
          throw new Error(
            errorData.error || 'ディレクトリ内のファイル一覧の取得に失敗しました'
          );
        }

        const filesData = await filesResponse.json();
        const markdownFiles = filesData.markdown_files;
        const pdfFileName = filesData.pdf_file;

        if (!markdownFiles || !markdownFiles.length) {
          throw new Error(
            '指定されたディレクトリ内にマークダウンファイルが存在しません'
          );
        }

        if (!pdfFileName) {
          throw new Error(
            '指定されたディレクトリ内にPDFファイルが存在しません'
          );
        }

        // baseFileNameを設定
        const originMarkdownFile = markdownFiles.find((name) =>
          name.endsWith('_origin.md')
        );

        if (!originMarkdownFile) {
          throw new Error(
            '指定されたディレクトリ内に_origin.mdファイルが存在しません'
          );
        }

        const baseFileName = originMarkdownFile.replace('_origin.md', '');
        setBaseFileName(baseFileName);

        console.log('Markdown file found:', originMarkdownFile);
        console.log('PDF file found:', pdfFileName);

        // 翻訳済みファイルの存在をチェック
        const transMarkdownFile = markdownFiles.find((name) =>
          name.endsWith('_trans.md')
        );

        if (transMarkdownFile) {
          setShowJapaneseButton(true);
          setShowTranslateButton(false);
        } else {
          setShowJapaneseButton(false);
          setShowTranslateButton(true);
        }

        // PDFのURLを設定
        setPdfToDisplay({
          type: 'saved',
          url: `http://127.0.0.1:5601/contents/${dirName}/${pdfFileName}`,
        });

        // マークダウンの取得を開始
        await fetchMarkdownContent(dirName, baseFileName, 'origin');

        // エージェント状態を取得
        await fetchAgentState(dirName);
      } catch (error) {
        console.error('Error processing directory:', error);
        alert('処理中にエラーが発生しました: ' + error.message);
        setMarkdownLoading(false);
      } finally {
        setLoading(false);
      }
    };

    processDirectory();
  }, [selectedDirectory]);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
    console.log('Toggled sidebar:', !sidebarOpen);
  };

  const handleSelectDirectory = (dirName) => {
    setSelectedDirectory(dirName);
    setPdfToDisplay(null); // 前回のPDFをリセット
    setContent(''); // マークダウン内容をリセット
    setMarkdownError('');
    setMarkdownLoading(true);
    setIsAppending(false); // 新しいPDF読み込み時には追加を無効化
    setIsModified(false); // ディレクトリ変更時に編集状態をリセット
    setActiveTab('preview'); // ディレクトリ変更時にプレビューモードに切り替え
    setAgentState(null); // エージェント状態をリセット
    // setChat([]); // チャットをリセットする処理はfetchAgentState内で行う
  };

  // 削除リクエストのハンドラー
  const handleRequestDeleteDirectory = (dirName) => {
    setConfirmDeleteDir(dirName);
  };

  // 確認ダイアログでキャンセルをハンドル
  const handleCancelDelete = () => {
    setConfirmDeleteDir(null);
  };

  // 確認ダイアログで削除をハンドル
  const handleConfirmDelete = async () => {
    if (confirmDeleteDir) {
      await handleDeleteDirectory(confirmDeleteDir);
      setConfirmDeleteDir(null);
    }
  };

  // 削除ロジック
  const handleDeleteDirectory = async (dirName) => {
    try {
      const response = await fetch('http://127.0.0.1:5601/delete_directory', {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dir_name: dirName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'ディレクトリの削除に失敗しました');
      }

      const data = await response.json();
      // alert(data.message || 'ディレクトリを削除しました');

      // ディレクトリリストを再取得
      await fetchDirectories();

      // もし削除したディレクトリが選択されていたらリセット
      if (selectedDirectory === dirName) {
        setSelectedDirectory(null);
        setPdfToDisplay(null);
        setContent('');
        setAgentState(null); // エージェント状態をリセット
        setChat([]); // チャットをリセット
      }
    } catch (error) {
      console.error('Error deleting directory:', error);
      alert('ディレクトリの削除中にエラーが発生しました: ' + error.message);
    }
  };

  // +翻訳ボタンのクリックハンドラー
  const handleTranslate = async () => {
    if (!selectedDirectory || !baseFileName) {
      alert('ディレクトリまたはファイル名が不明です');
      return;
    }

    try {
      setMarkdownLoading(true);
      setProcessingStatus('翻訳中...'); // 進捗状況を設定
      setIsAppending(true); // 逐次的な追加を開始
      setContent(''); // マークダウン内容をリセット

      const url = 'http://127.0.0.1:5601/trans_markdown';
      const options = {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dir_name: selectedDirectory }),
      };

      const response = await fetch(url, options);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '翻訳の処理に失敗しました');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      let inLLMOutput = false;
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // data: で始まり、\n\n で終わるメッセージをパース
        let messages = buffer.split('\n\n');
        buffer = messages.pop(); // 未完了のメッセージをバッファに残す

        for (const message of messages) {
          if (message.startsWith('data:')) {
            const dataContent = message.slice('data: '.length);
            try {
              const data = JSON.parse(dataContent);

              if (data.error) {
                throw new Error(data.error);
              }

              if (data.status) {
                console.log('Status:', data.status);
                setProcessingStatus(data.status);
              }

              if (data.llm_output) {
                //console.log('LLM_OUTPUT:', data.llm_output);
                if (data.llm_output === 'start') {
                  inLLMOutput = true;
                  setContent(''); // マークダウン内容をリセット
                } else if (data.llm_output === 'end') {
                  inLLMOutput = false;
                  setIsAppending(false); // 逐次的な追加を終了
                  setMarkdownLoading(false); // LLM出力終了時にロード状態を解除
                  setProcessingStatus(''); // 進捗状況をリセット
                  setShowTranslateButton(false); // 翻訳ボタンを非表示
                  setShowJapaneseButton(true); // 日本語訳ボタンを表示
                  setCurrentMarkdownType('trans'); // 現在のマークダウンタイプをtransに設定
                } else if (inLLMOutput) {
                  // LLMの出力を逐次的に追加
                  setContent((prevContent) => prevContent + data.llm_output);
                  setIsModified(true); // 編集内容が変更されたことを記録
                }
              }
            } catch (e) {
              console.error('Error parsing data:', e);
            }
          }
        }
      }

      // バッファに残ったデータを処理
      if (buffer && buffer.startsWith('data:')) {
        const dataContent = buffer.slice('data: '.length);
        try {
          const data = JSON.parse(dataContent);

          if (data.error) {
            throw new Error(data.error);
          }

          if (data.status) {
            console.log('Status:', data.status);
            setProcessingStatus(data.status);
          }

          if (data.llm_output) {
            //console.log('LLM_OUTPUT:', data.llm_output);
            if (data.llm_output === 'start') {
              inLLMOutput = true;
              setContent(''); // マークダウン内容をリセット
            } else if (data.llm_output === 'end') {
              inLLMOutput = false;
              setIsAppending(false); // 逐次的な追加を終了
              setMarkdownLoading(false); // LLM出力終了時にロード状態を解除
              setProcessingStatus(''); // 進捗状況をリセット
              setShowTranslateButton(false); // 翻訳ボタンを非表示
              setShowJapaneseButton(true); // 日本語訳ボタンを表示
              setCurrentMarkdownType('trans'); // 現在のマークダウンタイプをtransに設定
            } else if (inLLMOutput) {
              // LLMの出力を逐次的に追加
              setContent((prevContent) => prevContent + data.llm_output);
              setIsModified(true); // 編集内容が変更されたことを記録
            }
          }
        } catch (e) {
          console.error('Error parsing data:', e);
        }
      }
    } catch (error) {
      console.error('Error during translation:', error);
      alert('翻訳中にエラーが発生しました: ' + error.message);
      setMarkdownLoading(false);
      setIsAppending(false); // エラー発生時にも追加を終了
    }
  };

  // 日本語訳ボタンのクリックハンドラー
  const handleShowJapanese = async () => {
    if (!selectedDirectory || !baseFileName) {
      alert('ディレクトリまたはファイル名が不明です');
      return;
    }

    try {
      setMarkdownLoading(true);
      setProcessingStatus(''); // 進捗状況をリセット
      setIsAppending(false); // 一括で読み込むため追加を無効化
      setContent(''); // マークダウン内容をリセット

      await fetchMarkdownContent(selectedDirectory, baseFileName, 'trans');
      setCurrentMarkdownType('trans'); // 現在のマークダウンタイプをtransに設定
      setIsModified(false); // 日本語訳を表示する際は変更されていないとみなす
      setActiveTab('preview'); // 日本語訳を表示後にプレビューモードに切り替え
    } catch (error) {
      console.error('Error fetching Japanese markdown:', error);
      alert('日本語訳の取得中にエラーが発生しました: ' + error.message);
      setMarkdownLoading(false);
    }
  };

  const handleShowOrigin = async () => {
    if (!selectedDirectory || !baseFileName) {
      alert('ディレクトリまたはファイル名が不明です');
      return;
    }

    try {
      setMarkdownLoading(true);
      setProcessingStatus('');
      setIsAppending(false);
      setContent('');

      await fetchMarkdownContent(selectedDirectory, baseFileName, 'origin');
      setCurrentMarkdownType('origin'); // 現在のマークダウンタイプをoriginに設定
      setIsModified(false); // 原文を表示する際は変更されていないとみなす
      setActiveTab('preview'); // 原文を表示後にプレビューモードに切り替え
    } catch (error) {
      console.error('Error fetching origin markdown:', error);
      alert('原文の取得中にエラーが発生しました: ' + error.message);
      setMarkdownLoading(false);
    }
  };

  const fetchMarkdownContent = async (
    dirName,
    baseFileName,
    type,
    retryCount = 0
  ) => {
    try {
      const mdFileName =
        type === 'origin'
          ? `${baseFileName}_origin.md`
          : `${baseFileName}_trans.md`;
      const markdownResponse = await fetchWithTimeout(
        `http://127.0.0.1:5601/contents/${dirName}/${mdFileName}`,
        {
          method: 'GET',
          mode: 'cors',
        }
      );

      if (!markdownResponse || !markdownResponse.ok) {
        throw new Error('マークダウンの取得に失敗しました');
      }

      let markdownContent = await markdownResponse.text();
      console.log('Fetched markdown content.');

      // マークダウンテキスト内の画像パスを置換
      markdownContent = markdownContent
        .replace(
          /!\[Local Image\]\(picture-(\d+)\.png\)/g,
          `![Local Image](http://127.0.0.1:5601/contents/${dirName}/picture-$1.png)`
        )
        .replace(
          /!\[Local Image\]\(table-(\d+)\.png\)/g,
          `![Local Image](http://127.0.0.1:5601/contents/${dirName}/table-$1.png)`
        );

      setContent(markdownContent);
      console.log('Set markdown content to state.');
      setIsModified(false); // コンテンツを取得した時点で変更なし

      // Update buttons based on type
      if (type === 'origin') {
        setCurrentMarkdownType('origin');
      } else {
        setCurrentMarkdownType('trans');
      }
    } catch (error) {
      if (retryCount < 5) {
        console.log('Retrying to fetch markdown...', retryCount);
        setTimeout(
          () => fetchMarkdownContent(dirName, baseFileName, type, retryCount + 1),
          1000
        );
      } else {
        console.error('Error fetching markdown:', error);
        setMarkdownError('マークダウンの取得に失敗しました');
      }
    } finally {
      setMarkdownLoading(false);
    }
  };

  // 保存機能の実装
  const handleSave = async () => {
    try {
      if (!selectedDirectory || !baseFileName) {
        alert('ディレクトリまたはファイル名が不明です');
        return;
      }

      const type = currentMarkdownType; // 'origin' または 'trans'
      const mdFileName =
        type === 'origin'
          ? `${baseFileName}_origin.md`
          : `${baseFileName}_trans.md`;

      const url = 'http://127.0.0.1:5601/save_markdown'; // 保存用APIエンドポイント
      const options = {
        method: 'POST', // または 'PUT'、APIに合わせて変更
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dir_name: selectedDirectory,
          file_name: mdFileName,
          content: content,
        }),
      };

      const response = await fetch(url, options);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '保存に失敗しました');
      }

      alert('保存が完了しました');
      setIsModified(false); // 保存後は変更状態をリセット
    } catch (error) {
      console.error('Error saving markdown:', error);
      alert('保存中にエラーが発生しました: ' + error.message);
    }
  };

  return (
    <div
      className={`min-h-screen bg-gray-100 transition-transform duration-300 ${
        sidebarOpen ? 'pl-[250px]' : ''
      }`}
      onPaste={handlePaste}
    >
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        directories={directories}
        onSelectDirectory={handleSelectDirectory}
        selectedDirectory={selectedDirectory}
        onRequestDeleteDirectory={handleRequestDeleteDirectory}
      />
      <Header
        onPdfSelect={(pdf) => {
          setPdfToDisplay(pdf);
          setSelectedDirectory(null); // ディレクトリ選択をリセット
          setContent(''); // マークダウン内容をリセット
          setMarkdownError('');
          setMarkdownLoading(true);
          setIsAppending(false); // 新しいPDF読み込み時には追加を無効化
          setIsModified(false); // 新しいPDF読み込み時に編集状態をリセット
          setActiveTab('preview'); // 新しいPDF読み込み時にプレビューモードに切り替え
          setAgentState(null); // エージェント状態をリセット
          setChat([]); // チャットをリセット
        }}
        onMenuClick={toggleSidebar}
        sidebarOpen={sidebarOpen}
      />
      <main className="mx-auto p-4 h-[calc(100vh-4rem)]">
        <Split
          className="split h-full flex"
          gutterSize={12}
          sizes={[30, 40, 30]}
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
                      pdfToDisplay.type === 'url' ||
                      pdfToDisplay.type === 'saved'
                        ? pdfToDisplay.url
                        : pdfToDisplay.type === 'file'
                        ? pdfToDisplay.file
                        : null
                    }
                    onLoadSuccess={onDocumentLoadSuccess}
                    loading={
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="animate-spin mr-2 h-5 w-5 text-gray-500" />
                        <div>PDF読み込み中...</div>
                      </div>
                    }
                    error={
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="animate-spin mr-2 h-5 w-5 text-gray-500" />
                        <div>PDF読み込み中...</div>
                      </div>
                    }
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
          <div className="flex flex-col relative">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="h-full pb-3"
            >
              <div className="flex justify-between items-center mb-2">
                {/* 左側に「原文」ボタンと「+翻訳」ボタンを追加 */}
                <div className="flex space-x-2">
                  <Button
                    variant={currentMarkdownType === 'origin' ? 'outline' : 'primary'}
                    size="sm"
                    onClick={handleShowOrigin}
                  >
                    原文
                  </Button>
                  {showTranslateButton && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleTranslate}
                    >
                      +翻訳
                    </Button>
                  )}
                  {showJapaneseButton && (
                    <Button
                      variant={currentMarkdownType === 'trans' ? 'outline' : 'primary'}
                      size="sm"
                      onClick={handleShowJapanese}
                    >
                      日本語訳
                    </Button>
                  )}
                </div>

                {/* 右側に「保存する」ボタンとタブを配置 */}
                <div className="flex items-center">
                  {activeTab === 'edit' && isModified && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSave}
                      className="mr-2"
                    >
                      保存する
                    </Button>
                  )}
                  <TabsList>
                    <TabsTrigger value="edit">編集モード</TabsTrigger>
                    <TabsTrigger value="preview">プレビューモード</TabsTrigger>
                  </TabsList>
                </div>
              </div>

              <>
                <TabsContent
                  value="edit"
                  className="h-[calc(100%-2rem)] w-full"
                >
                  <Textarea
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      setIsModified(true); // テキストが変更されたことを記録
                    }}
                    className="bg-white h-full resize-none font-mono"
                    placeholder="マークダウンを入力してください..."
                  />
                </TabsContent>

                <TabsContent
                  value="preview"
                  className="h-[calc(100%-2rem)] w-full"
                >
                  <Card className="h-full overflow-auto" ref={previewContainerRef}>
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

              {markdownLoading && (
                <div className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center bg-white bg-opacity-75">
                  <div className="flex items-center">
                    <Loader2 className="animate-spin mr-2 h-5 w-5 text-gray-500" />
                    <div>
                      {processingStatus || 'マークダウン読み込み中...'}
                    </div>
                  </div>
                </div>
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
                        <div
                          className={`rounded-lg px-4 py-2 max-w-[80%] ${
                            msg.role === 'user'
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-200 text-black'
                          }`}
                        >
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
                  {/* アシスタントのローディングスピナーを追加 */}
                  {isAssistantTyping && (
                    <div className="flex justify-start items-center mt-4">
                      <Loader2 className="animate-spin mr-2 h-5 w-5 text-gray-500" />
                      <div>回答生成中...</div>
                    </div>
                  )}
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

      {/* 確認ダイアログの追加 */}
      <ConfirmationDialog
        isOpen={confirmDeleteDir !== null}
        message={`本当に「${confirmDeleteDir}」を削除しますか？`}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default App;

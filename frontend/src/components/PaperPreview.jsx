// src/components/PaperPreview.jsx

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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

import { fetchWithTimeout } from './fetchWithTimeout';
import ConfirmationDialog from './ConfirmationDialog';
import Sidebar from './Sidebar';
import Header from './Header';

// PDF.js のワーカーを設定
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';

const PaperPreview = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState([]);
  const [pendingImages, setPendingImages] = useState([]);

  const [pdfToDisplay, setPdfToDisplay] = useState(null);
  const [selectedDirectory, setSelectedDirectory] = useState(null);
  const [numPages, setNumPages] = useState(0);

  const [directories, setDirectories] = useState([]);
  const [latestDirectory, setLatestDirectory] = useState(null);

  const pdfContainerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(null);

  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const [markdownLoading, setMarkdownLoading] = useState(false);
  const [markdownError, setMarkdownError] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  const previewContainerRef = useRef(null);
  const [isAppending, setIsAppending] = useState(false);
  const [showTranslateButton, setShowTranslateButton] = useState(false);
  const [showJapaneseButton, setShowJapaneseButton] = useState(false);
  const [currentMarkdownType, setCurrentMarkdownType] = useState('origin');
  const [baseFileName, setBaseFileName] = useState('');
  const [activeTab, setActiveTab] = useState('preview');
  const [isModified, setIsModified] = useState(false);
  const [confirmDeleteDir, setConfirmDeleteDir] = useState(null);
  const [agentState, setAgentState] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);

  // セッション管理用
  const [sessionId, setSessionId] = useState(null);             // 現在のセッションID（チャットを保存するID）
  const [chatSessions, setChatSessions] = useState([]);          // 該当dir_nameのセッション一覧
  const [restoredSessionId, setRestoredSessionId] = useState(null); 

  // フロント側で新規セッション判定を行うため、送信時にフラグを仕込む
  const [isNewSession, setIsNewSession] = useState(false);

  const updateContainerWidth = () => {
    if (pdfContainerRef.current) {
      const width = pdfContainerRef.current.offsetWidth;
      if (width > 0) {
        setContainerWidth(width);
      }
    }
  };

  const fetchDirectories = async () => {
    try {
      const response = await fetchWithTimeout(
        `http://${import.meta.env.VITE_APP_IP}:5601/list_contents`,
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

  // 指定のdir_nameに紐づくチャットセッション一覧を取得
  const fetchChatSessions = async (dirName) => {
    try {
      const res = await fetch(
        `http://${import.meta.env.VITE_APP_IP}:5601/list_chat_sessions?dir_name=${encodeURIComponent(dirName)}`,
        { method: 'GET', mode: 'cors' }
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'チャットセッション一覧の取得に失敗しました');
      }
      const data = await res.json();
      setChatSessions(data.sessions);
    } catch (error) {
      console.error('Error fetching chat sessions:', error);
      alert('チャットセッション一覧の取得に失敗しました: ' + error.message);
    }
  };

  // セッションIDを指定してメッセージを復元
  const fetchChatHistory = async (sessionIdToLoad) => {
    try {
      const res = await fetch(
        `http://${import.meta.env.VITE_APP_IP}:5601/get_chat_history?session_id=${sessionIdToLoad}`,
        { method: 'GET', mode: 'cors' }
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'チャット履歴の取得に失敗しました');
      }
      const data = await res.json();
      // フロントのチャットにも反映
      setChat(data.messages);
    } catch (error) {
      console.error('Error fetching chat history:', error);
      alert('チャット履歴の取得に失敗しました: ' + error.message);
    }
  };

  // 新しいセッションを作成
  const createNewSession = async (dirName) => {
    try {
      const res = await fetch(
        `http://${import.meta.env.VITE_APP_IP}:5601/create_chat_session?dir_name=${encodeURIComponent(dirName)}`,
        { method: 'POST', mode: 'cors' }
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '新規チャットセッションの作成に失敗しました');
      }
      const data = await res.json();
      return data.session_id;
    } catch (error) {
      console.error('Error creating new session:', error);
      alert('新規チャットセッションの作成に失敗しました: ' + error.message);
      return null;
    }
  };

  // 既存セッションを削除
  const deleteChatSession = async (oldSessionId) => {
    try {
      const res = await fetch(`http://${import.meta.env.VITE_APP_IP}:5601/delete_chat_session`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: oldSessionId }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'セッションの削除に失敗しました');
      }
      console.log(`Session ${oldSessionId} deleted successfully`);
    } catch (error) {
      console.error('Error deleting chat session:', error);
      alert('セッション削除中にエラーが発生しました: ' + error.message);
    }
  };

  // まとめてメッセージを挿入(旧チャット含めて新セッションに再保存) 
  const bulkSaveChat = async (newSessId, messages) => {
    try {
      const res = await fetch(`http://${import.meta.env.VITE_APP_IP}:5601/bulk_save_chat`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: newSessId,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '一括保存に失敗しました');
      }
      console.log(`Bulk save to new session ${newSessId} completed.`);
    } catch (error) {
      console.error('Error bulk saving chat:', error);
      alert('一括保存中にエラーが発生しました: ' + error.message);
    }
  };

  useLayoutEffect(() => {
    updateContainerWidth();
  }, [pdfToDisplay, selectedDirectory]);

  useEffect(() => {
    window.addEventListener('resize', updateContainerWidth);
    return () => {
      window.removeEventListener('resize', updateContainerWidth);
    };
  }, []);

  useEffect(() => {
    fetchDirectories();
  }, []);

  const handleChatReset = async () => {
    if (!selectedDirectory) {
      alert('ディレクトリが選択されていません');
      return;
    }
    // 単にフロント側をリセット
    setChat([]);
    setSessionId(null);
    setRestoredSessionId(null);
    setIsNewSession(false);
    console.log('Chat has been reset in the frontend.');
    // エージェント状態初期化
    await fetchAgentState(selectedDirectory);
  };

  const fetchAgentState = async (dirName) => {
    try {
      const response = await fetch(
        `http://${import.meta.env.VITE_APP_IP}:5601/initialize_state?input_dir=${dirName}`,
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
    } catch (error) {
      console.error('Error initializing agent state:', error);
      alert('エージェントの初期化中にエラーが発生しました: ' + error.message);
    }
  };

  // メッセージ送信時の処理
  const handleSend = async () => {
    // メッセージが空 & 画像アップロードなし の場合は何もしない
    if (!message.trim() && pendingImages.length === 0) {
      return;
    }
    // ディレクトリが選択されていなければエラー
    if (!selectedDirectory) {
      alert('ディレクトリが選択されていません');
      return;
    }
    if (!agentState) {
      alert('エージェントが初期化されていません');
      return;
    }

    // 送信したタイミングでメッセージ入力欄をクリア
    const currentMessage = message.trim();
    setMessage('');

    try {
      setChatLoading(true);
      setIsAssistantTyping(true);

      // 「復元したセッションID」で表示中かつ sessionIdがnull の場合は「削除→新規作成→過去ログ移し替え」
      let finalSessionId = sessionId;
      if (restoredSessionId && sessionId === null) {
        await deleteChatSession(restoredSessionId);
        finalSessionId = await createNewSession(selectedDirectory);
        setSessionId(finalSessionId);
        if (chat.length > 0) {
          await bulkSaveChat(finalSessionId, chat);
        }
        setRestoredSessionId(null);
        setIsNewSession(false);
      }

      // もし既存のsessionIdがなければ新規セッションを作成
      let sessionWasNewlyCreated = false;
      if (!finalSessionId) {
        finalSessionId = await createNewSession(selectedDirectory);
        setSessionId(finalSessionId);
        sessionWasNewlyCreated = true;
        setIsNewSession(true);
      }

      // ユーザーメッセージを画面に追加
      setChat((prevChat) => [
        ...prevChat,
        { role: 'user', type: 'text', content: currentMessage },
      ]);

      // agentState 側にもユーザーメッセージを追加
      const newAgentState = { ...agentState };
      newAgentState.messages.push({ role: 'user', content: currentMessage });

      // scholar_agent へ問い合わせ
      const response = await fetch(`http://${import.meta.env.VITE_APP_IP}:5601/scholar_agent`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state: newAgentState,
          user_input: currentMessage,
          session_id: finalSessionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'エージェントからの応答取得に失敗しました');
      }

      const data = await response.json();
      setAgentState(data.state);

      const assistantMessage = data.state.messages[data.state.messages.length - 1];

      // アシスタントメッセージを画面に追加
      setChat((prevChat) => [
        ...prevChat,
        {
          role: assistantMessage.role,
          type: 'text',
          content: assistantMessage.content,
        },
      ]);

      // 画像は今回未送信なので、ここでは pendingImages をクリア
      setPendingImages([]);

      // 新規セッションのとき、最初のメッセージが返ってきた後にタイトルを「タイムスタンプ」に書き換える
      if (sessionWasNewlyCreated) {
        // 送信後にセッション一覧を取得
        await fetchChatSessions(selectedDirectory);
        setRestoredSessionId(finalSessionId);
      }

    } catch (error) {
      console.error('Error during chat:', error);
      alert('チャット中にエラーが発生しました: ' + error.message);
    } finally {
      setChatLoading(false);
      setIsAssistantTyping(false);
      // 追加のセッション一覧リロード
      await fetchChatSessions(selectedDirectory);
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
    updateContainerWidth();
    console.log(`Loaded PDF with ${numPages} pages.`);
  }

  const handleZoomIn = () => {
    setScale((prevScale) => Math.min(prevScale + 0.2, 3.0));
  };

  const handleZoomOut = () => {
    setScale((prevScale) => Math.max(prevScale - 0.2, 0.5));
  };

  useEffect(() => {
    if (previewContainerRef.current) {
      if (isAppending) {
        previewContainerRef.current.scrollTop = previewContainerRef.current.scrollHeight;
      } else {
        previewContainerRef.current.scrollTop = 0;
      }
    }
  }, [content, isAppending]);

  // PDF選択 or URL指定時
  useEffect(() => {
    const processPdf = async () => {
      if (!pdfToDisplay) return;

      if (pdfToDisplay.type === 'file' || pdfToDisplay.type === 'url') {
        try {
          setLoading(true);
          setMarkdownLoading(true);
          setMarkdownError('');
          setContent('');
          setNumPages(0);
          setScale(1.0);
          setProcessingStatus('');
          setShowTranslateButton(false);
          setShowJapaneseButton(false);
          setCurrentMarkdownType('origin');
          setBaseFileName('');
          setAgentState(null);
          setChat([]);
          setSessionId(null);
          setChatSessions([]);
          setRestoredSessionId(null);
          setIsNewSession(false);

          const url = `http://${import.meta.env.VITE_APP_IP}:5601/pdf2markdown`;
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
            options.body = JSON.stringify({ url: pdfToDisplay.url });
          }

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

          setIsAppending(true);

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
                    setProcessingStatus(data.status);
                  }

                  if (data.llm_output) {
                    if (data.llm_output === 'start') {
                      inLLMOutput = true;
                      setContent('');
                    } else if (data.llm_output === 'end') {
                      inLLMOutput = false;
                      setIsAppending(false);
                      setMarkdownLoading(false);
                      setProcessingStatus('');
                      if (data.translation_exists) {
                        setShowJapaneseButton(true);
                        setShowTranslateButton(false);
                      } else {
                        setShowJapaneseButton(false);
                        setShowTranslateButton(true);
                      }
                      setCurrentMarkdownType('origin');
                    } else if (inLLMOutput) {
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

          const pdfFileResponse = await fetchWithTimeout(
            `http://${import.meta.env.VITE_APP_IP}:5601/list_files/${dirName}`,
            {
              method: 'GET',
              mode: 'cors',
            }
          );

          if (!pdfFileResponse || !pdfFileResponse.ok) {
            const errorData = pdfFileResponse ? await pdfFileResponse.json() : {};
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

          const newPdfToDisplay = {
            type: 'saved',
            url: `http://${import.meta.env.VITE_APP_IP}:5601/contents/${dirName}/${pdfFileName}`,
          };
          setPdfToDisplay(newPdfToDisplay);
          setLatestDirectory(dirName);
          await fetchDirectories();
          setSelectedDirectory(dirName);
          setBaseFileName(baseFileName);

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

          await fetchAgentState(dirName);
          // チャットはまだ行われていないのでセッション作成しない
          // セッション一覧を取得
          await fetchChatSessions(dirName);

        } catch (error) {
          console.error('Error processing PDF:', error);
          alert('処理中にエラーが発生しました: ' + error.message);
          setMarkdownLoading(false);
          setIsAppending(false);
        } finally {
          setLoading(false);
        }
      }
    };

    processPdf();
  }, [pdfToDisplay]);

  // ディレクトリ選択時
  useEffect(() => {
    const processDirectory = async () => {
      if (!selectedDirectory) return;

      try {
        setLoading(true);
        setMarkdownLoading(true);
        setMarkdownError('');
        setContent('');
        setNumPages(0);
        setScale(1.0);
        setProcessingStatus('');
        setIsAppending(false);
        setShowTranslateButton(false);
        setShowJapaneseButton(false);
        setCurrentMarkdownType('origin');
        setBaseFileName('');
        setAgentState(null);
        setChat([]);
        setSessionId(null);
        setChatSessions([]);
        setRestoredSessionId(null);
        setIsNewSession(false);

        const dirName = selectedDirectory;

        const filesResponse = await fetchWithTimeout(
          `http://${import.meta.env.VITE_APP_IP}:5601/list_files/${dirName}`,
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

        setPdfToDisplay({
          type: 'saved',
          url: `http://${import.meta.env.VITE_APP_IP}:5601/contents/${dirName}/${pdfFileName}`,
        });

        await fetchMarkdownContent(dirName, baseFileName, 'origin');
        await fetchAgentState(dirName);
        await fetchChatSessions(dirName);
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
  };

  const handleSelectDirectory = (dirName) => {
    setSelectedDirectory(dirName);
    setPdfToDisplay(null);
    setContent('');
    setMarkdownError('');
    setMarkdownLoading(true);
    setIsAppending(false);
    setIsModified(false);
    setActiveTab('preview');
    setAgentState(null);
    setChat([]);
    setSessionId(null);
    setChatSessions([]);
    setRestoredSessionId(null);
    setIsNewSession(false);
  };

  const handleRequestDeleteDirectory = (dirName) => {
    setConfirmDeleteDir(dirName);
  };

  const handleCancelDelete = () => {
    setConfirmDeleteDir(null);
  };

  const handleConfirmDelete = async () => {
    if (confirmDeleteDir) {
      await handleDeleteDirectory(confirmDeleteDir);
      setConfirmDeleteDir(null);
    }
  };

  const handleDeleteDirectory = async (dirName) => {
    try {
      const response = await fetch(`http://${import.meta.env.VITE_APP_IP}:5601/delete_directory`, {
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

      await fetchDirectories();

      if (selectedDirectory === dirName) {
        setSelectedDirectory(null);
        setPdfToDisplay(null);
        setContent('');
        setAgentState(null);
        setChat([]);
        setSessionId(null);
        setChatSessions([]);
        setRestoredSessionId(null);
        setIsNewSession(false);
      }
    } catch (error) {
      console.error('Error deleting directory:', error);
      alert('ディレクトリの削除中にエラーが発生しました: ' + error.message);
    }
  };

  const handleTranslate = async () => {
    if (!selectedDirectory || !baseFileName) {
      alert('ディレクトリまたはファイル名が不明です');
      return;
    }

    try {
      setMarkdownLoading(true);
      setProcessingStatus('翻訳中...');
      setIsAppending(true);
      setContent('');

      const url = `http://${import.meta.env.VITE_APP_IP}:5601/trans_markdown`;
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

        let messages = buffer.split('\n\n');
        buffer = messages.pop();

        for (const message of messages) {
          if (message.startsWith('data:')) {
            const dataContent = message.slice('data: '.length);
            try {
              const data = JSON.parse(dataContent);

              if (data.error) {
                throw new Error(data.error);
              }

              if (data.status) {
                setProcessingStatus(data.status);
              }

              if (data.llm_output) {
                if (data.llm_output === 'start') {
                  inLLMOutput = true;
                  setContent('');
                } else if (data.llm_output === 'end') {
                  inLLMOutput = false;
                  setIsAppending(false);
                  setMarkdownLoading(false);
                  setProcessingStatus('');
                  setShowTranslateButton(false);
                  setShowJapaneseButton(true);
                  setCurrentMarkdownType('trans');
                } else if (inLLMOutput) {
                  setContent((prevContent) => prevContent + data.llm_output);
                  setIsModified(true);
                }
              }
            } catch (e) {
              console.error('Error parsing data:', e);
            }
          }
        }
      }

      // バッファ残りを処理
      if (buffer && buffer.startsWith('data:')) {
        const dataContent = buffer.slice('data: '.length);
        try {
          const data = JSON.parse(dataContent);

          if (data.error) {
            throw new Error(data.error);
          }

          if (data.status) {
            setProcessingStatus(data.status);
          }

          if (data.llm_output) {
            if (data.llm_output === 'start') {
              inLLMOutput = true;
              setContent('');
            } else if (data.llm_output === 'end') {
              inLLMOutput = false;
              setIsAppending(false);
              setMarkdownLoading(false);
              setProcessingStatus('');
              setShowTranslateButton(false);
              setShowJapaneseButton(true);
              setCurrentMarkdownType('trans');
            } else if (inLLMOutput) {
              setContent((prevContent) => prevContent + data.llm_output);
              setIsModified(true);
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
      setIsAppending(false);
    }
  };

  const handleShowJapanese = async () => {
    if (!selectedDirectory || !baseFileName) {
      alert('ディレクトリまたはファイル名が不明です');
      return;
    }

    try {
      setMarkdownLoading(true);
      setProcessingStatus('');
      setIsAppending(false);
      setContent('');

      await fetchMarkdownContent(selectedDirectory, baseFileName, 'trans');
      setCurrentMarkdownType('trans');
      setIsModified(false);
      setActiveTab('preview');
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
      setCurrentMarkdownType('origin');
      setIsModified(false);
      setActiveTab('preview');
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
        `http://${import.meta.env.VITE_APP_IP}:5601/contents/${dirName}/${mdFileName}`,
        {
          method: 'GET',
          mode: 'cors',
        }
      );

      if (!markdownResponse || !markdownResponse.ok) {
        throw new Error('マークダウンの取得に失敗しました');
      }

      let markdownContent = await markdownResponse.text();

      markdownContent = markdownContent
        .replace(
          /!\[Local Image\]\(picture-(\d+)\.png\)/g,
          `![Local Image](http://${import.meta.env.VITE_APP_IP}:5601/contents/${dirName}/picture-$1.png)`
        )
        .replace(
          /!\[Local Image\]\(table-(\d+)\.png\)/g,
          `![Local Image](http://${import.meta.env.VITE_APP_IP}:5601/contents/${dirName}/table-$1.png)`
        );

      setContent(markdownContent);
      setIsModified(false);

      if (type === 'origin') {
        setCurrentMarkdownType('origin');
      } else {
        setCurrentMarkdownType('trans');
      }
    } catch (error) {
      if (retryCount < 5) {
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

  const handleSave = async () => {
    try {
      if (!selectedDirectory || !baseFileName) {
        alert('ディレクトリまたはファイル名が不明です');
        return;
      }

      const type = currentMarkdownType;
      const mdFileName =
        type === 'origin'
          ? `${baseFileName}_origin.md`
          : `${baseFileName}_trans.md`;

      const url = `http://${import.meta.env.VITE_APP_IP}:5601/save_markdown`;
      const options = {
        method: 'POST',
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
      setIsModified(false);
    } catch (error) {
      console.error('Error saving markdown:', error);
      alert('保存中にエラーが発生しました: ' + error.message);
    }
  };

  // セレクトでセッションを選択したとき（チャット復元）
  const handleSelectSession = async (selectedSessionId) => {
    setChat([]);
    setSessionId(null);
    setRestoredSessionId(selectedSessionId);
    setIsNewSession(false);
    await fetchChatHistory(selectedSessionId);
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
          setSelectedDirectory(null);
          setContent('');
          setMarkdownError('');
          setMarkdownLoading(true);
          setIsAppending(false);
          setIsModified(false);
          setActiveTab('preview');
          setAgentState(null);
          setChat([]);
          setSessionId(null);
          setChatSessions([]);
          setRestoredSessionId(null);
          setIsNewSession(false);
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

              <TabsContent
                value="edit"
                className="h-[calc(100%-2rem)] w-full"
              >
                <Textarea
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setIsModified(true);
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
            <div className="pb-[10px] flex justify-between items-center">
              {/* チャットセッション一覧セレクト */}
              <Select
                onValueChange={(val) => handleSelectSession(val)}
                // 復元中のセッションがあればそのIDを表示。なければ '' を表示
                value={restoredSessionId ? String(restoredSessionId) : ''}
              >
                <SelectTrigger className="w-2/3 bg-white font-bold">
                    {restoredSessionId ? (
                      <SelectValue>
                        {
                          chatSessions.find(
                            (s) => s.id === Number(restoredSessionId)
                          )?.created_at || "チャット履歴なし"
                        }
                      </SelectValue>
                    ) : (
                      <SelectValue
                        placeholder={
                          chatSessions.length > 0
                            ? "チャット履歴を選択"
                            : "チャット履歴なし"
                        }
                      />
                    )}
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {chatSessions.map((session) => (
                      <SelectItem
                        key={session.id}
                        value={String(session.id)}
                      >
                        {/* IDは表示せず created_at（または置き換え後の文字列）を表示 */}
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
                    onKeyDown={(e) => {
                      // IME変換中（isComposing = true）の場合はEnter送信しない
                      if (e.nativeEvent.isComposing) {
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
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

      <ConfirmationDialog
        isOpen={confirmDeleteDir !== null}
        message={`本当に「${confirmDeleteDir}」を削除しますか？`}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default PaperPreview;

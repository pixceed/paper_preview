// src/components/PaperPreview/Header.jsx

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Menu, Upload, Link, BookOpenText } from 'lucide-react';

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
          <div className='flex'>
            <img src="binoculars_logo2.png" alt="Synapse Logo" className="h-8 w-8 mr-2 mt-0.5" />
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
                <TabsContent value="file" className="mt-0">
                  <div className="flex items-center gap-2">
                    {/* 長いファイル名が枠からはみ出ないように修正 */}
                    <div
                      className="w-[280px] h-9 rounded-md border border-input bg-background px-3 py-1 text-sm cursor-pointer flex items-center overflow-hidden text-ellipsis whitespace-nowrap"
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

export default Header;

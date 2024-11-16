import React, { useState } from "react";
import { Tab, Tabs, TabList, TabPanel } from "shadcn/ui";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/solid";

function PaperMarkdownView() {
  const [markdown, setMarkdown] = useState("# 論文内容をここに表示");
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="flex space-x-4">
      {/* 左側のマークダウン表示エリア */}
      <div className="w-2/3 bg-white p-4 rounded-md shadow-md">
        <Tabs value={isEditing ? "edit" : "preview"}>
          <TabList className="flex border-b">
            <Tab onClick={() => setIsEditing(false)}>プレビュー</Tab>
            <Tab onClick={() => setIsEditing(true)}>編集</Tab>
          </TabList>
          <TabPanel value="preview" className="p-4">
            <div
              className="markdown-preview prose"
              dangerouslySetInnerHTML={{ __html: markdown }}
            />
          </TabPanel>
          <TabPanel value="edit" className="p-4">
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              className="w-full h-64 p-2 border rounded-md"
              placeholder="マークダウンを入力してください"
            />
          </TabPanel>
        </Tabs>
      </div>

      {/* 右側のチャットエリア */}
      <div className="w-1/3 bg-gray-50 p-4 rounded-md shadow-md">
        <h2 className="text-lg font-bold mb-4 flex items-center">
          <ChatBubbleLeftRightIcon className="w-5 h-5 mr-2" />
          AIチャット
        </h2>
        <div className="flex flex-col space-y-4">
          <div className="bg-gray-200 p-2 rounded-md">
            <p>AIによる回答がここに表示されます</p>
          </div>
          <textarea
            placeholder="質問を入力してください"
            className="p-2 border rounded-md"
          ></textarea>
          <Button>送信</Button>
        </div>
      </div>
    </div>
  );
}

export default PaperMarkdownView;

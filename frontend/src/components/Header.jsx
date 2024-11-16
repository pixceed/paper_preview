import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button"; // ShadCN UI のボタンコンポーネント
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu"; // ShadCN UI のナビゲーションコンポーネント
import { cn } from "@/lib/utils"; // クラスネームの条件付き結合のため
import { FaFileUpload, FaLink } from "react-icons/fa"; // アイコンのインポート

function Header() {
  const location = useLocation();

  return (
    <header className="bg-white shadow-md fixed w-full top-0 z-50">
      <div className="px-4 py-3 flex items-center">
        {/* タイトル（左寄せ） */}
        <div className="flex items-center space-x-3 mr-auto">
          <Link to="/">
            <div className="flex items-center space-x-2">
              <div className="text-2xl font-semibold text-gray-800">
                ReadWise AI
              </div>
            </div>
          </Link>
        </div>

        {/* PDFファイルのアップロードとURL指定エリア（右寄せ） */}
        <div className="ml-auto flex items-center space-x-4">
          {/* PDFファイルアップロード */}
          <label className="flex items-center space-x-2">
            <FaFileUpload />
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              id="pdf-upload"
            />
            <Button as="label" htmlFor="pdf-upload" variant="outline" className="cursor-pointer">
              ファイルをアップロード
            </Button>
          </label>

          {/* PDFのURL指定 */}
          <label className="flex items-center space-x-2">
            <FaLink />
            <input
              type="url"
              placeholder="PDFのURLを入力"
              className="border p-2 rounded-md focus:outline-none focus:ring"
            />
          </label>

          {/* ナビゲーションメニュー（例: Homeリンク） */}
          <NavigationMenu>
            <ul className="flex space-x-4 sm:space-x-6">
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link
                    to="/"
                    className={cn(
                      "text-gray-600 hover:text-gray-900 transition font-medium",
                      location.pathname === "/" && "font-bold text-gray-900"
                    )}
                  >
                    Home
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              {/* 他のメニュー項目を追加したい場合はここに */}
            </ul>
          </NavigationMenu>
        </div>
      </div>
    </header>
  );
}

export default Header;

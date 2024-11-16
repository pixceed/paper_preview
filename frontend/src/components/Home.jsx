import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';

function Home() {
    const navigate = useNavigate();

    const apps = [
        {
            id: 1,
            name: 'ビジネスメール生成',
            description: '社外のお客様宛てのメール用に、表現・文言を修正します',
            icon: '📧',
            tags: ['ユーティリティ'],
            path: '/business_mail_generator',
        },
    ];

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTag, setSelectedTag] = useState(null);

    const tagOptions = Array.from(new Set(apps.flatMap((app) => app.tags)));

    const filteredApps = apps.filter((app) => {
        const matchesSearch =
            app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            app.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTag = selectedTag ? app.tags.includes(selectedTag) : true;
        return matchesSearch && matchesTag;
    });

    const handleAppClick = (path) => {
        navigate(path);
    };

    return (
        <>
            <div className="min-h-screen bg-gray-100 px-16 pt-20 pb-10">
                {/* 検索バーとタグフィルタ */}
                <div className="flex justify-between items-center mb-5">
                    <Button variant="outline" onClick={() => setSearchQuery('')}>
                        全て
                    </Button>
                    <div className="flex space-x-4 items-center">
                        {/* タグ選択用のセレクト */}
                        <Select onValueChange={setSelectedTag}>
                            <SelectTrigger className="w-64">
                                <SelectValue placeholder="すべてのタグ" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={null}>すべてのタグ</SelectItem>
                                {tagOptions.map((tag) => (
                                    <SelectItem key={tag} value={tag}>
                                        {tag}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="検索"
                            className="w-64"
                        />
                    </div>
                </div>

                {/* アプリの一覧 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {filteredApps.length > 0 ? (
                        filteredApps.map((app) => (
                            <Card
                                key={app.id}
                                onClick={() => handleAppClick(app.path)}
                                className="p-4 h-40 cursor-pointer hover:shadow-lg transition-shadow duration-300"
                            >
                                <div className="flex items-center space-x-4">
                                    <div className="text-4xl">{app.icon}</div>
                                    <div>
                                        <h3 className="text-lg font-semibold">{app.name}</h3>
                                        <div className="flex space-x-2 mt-1">
                                            {app.tags.map((tag, index) => (
                                                <span
                                                    key={index}
                                                    className="px-2 py-1 bg-gray-200 text-xs font-medium rounded"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <p className="mt-4 text-sm text-gray-600 line-clamp-3">
                                    {app.description}
                                </p>
                            </Card>
                        ))
                    ) : (
                        <p className="text-gray-500 text-center col-span-4">該当するアプリが見つかりませんでした。</p>
                    )}
                </div>
            </div>
        </>
    );
}

export default Home;

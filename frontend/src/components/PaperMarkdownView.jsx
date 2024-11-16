import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

function PaperMarkdownView() {
    const [markdownText, setMarkdownText] = useState('');
    const [chatText, setChatText] = useState('');
    const [isMarkdown, setIsMarkdown] = useState(true); // 表示モードの切り替え用
    const [loading, setLoading] = useState(false);

    // 初期マークダウン設定
    useEffect(() => {
        const initialMarkdown = `
# 問2 企業ネットワークの統合に関する次の記述を読んで、設問1〜4に答えよ。

D社は、本社及び三つの支社を国内に持つ中堅の商社である。D社の社内システムは、クラウドサービス事業者であるG社の仮想サーバでWebシステムとして構築されており、本社及び支社内のPCからインターネット経由で利用されている。このたびD社は、グループ企業のE社を吸収合併することになり、E社のネットワークをD社のネットワークに接続（以下、ネットワーク統合という）するための検討を行うことになった。

## [D社の現行のネットワークの概要]

D社の現行のネットワークの概要を次に示す。

1. PCは、G社VPC（Virtual Private Cloud）内にある仮想サーバにインターネットを経由してアクセスし、社内システムを利用する。VPCとは、クラウド内に用意されたプライベートな仮想ネットワークである。
2. 本社と支社間は、広域イーサネットサービス網（以下、広域イーサ網という）で接続している。
3. PCからインターネットを経由して他のサイトにアクセスするために、ファイアウォール（以下、FWという）のNAPT機能を利用する。
4. PCからインターネットを経由してVPC内部にアクセスするために、G社が提供している仮想的なIPsec VPNサーバ（以下、VPC GWという）を利用する。
5. FWとVPC GWの間にIPsecトンネルが設定されており、PCからVPCへのアクセスは、FWとVPC GWの間に設定されたIPsecトンネルを経由する。
6. 社内のネットワークの経路制御には、OSPFを利用しており、OSPFプロトコルを設定している機器は、ルータ、レイヤ3スイッチ（以下、L3SWという）及びFWである。
7. 本社のLANのOSPFエリアは0であり、支社1〜3のLAN及び広域イーサ網のOSPFエリアは1である。
8. FWにはインターネットへの静的デフォルト経路を設定しており、①全社のOSPFエリアからインターネットへのアクセスを可能にするための設定が行われている。

D社の現行のネットワーク構成を図1に示す。

![Local Image](picture-1.png)

図1 D社の現行のネットワーク構成

D社の現行のネットワークにおける各セグメントのIPアドレスを表1に示す。

### 表1 D社の現行のネットワークにおける各セグメントのIPアドレス

| セグメント | IPアドレス       | セグメント | IPアドレス       |
|------------|------------------|------------|------------------|
| a          | 172.16.0.0/23    | h          | 172.17.0.0/25    |
| b          | 172.16.2.0/23    | i          | 172.17.2.0/23    |
| c          | 172.16.4.0/23    | j          | 172.17.4.0/23    |
| d          | 172.16.6.0/23    | k          | 172.17.6.0/23    |
| e          | 172.16.8.0/23    | l          | 172.17.8.0/23    |
| f          | 172.16.10.0/23   | m          | t.u.v.5          |
| g          | 172.16.12.64/26  | n          | 192.168.1.0/24   |

G社は、クラウドサービス利用者のためにインターネットからアクセス可能なサービスポータルサイト（以下、サービスポータルという）を公開しており、クラウドサービス利用者はサービスポータルにアクセスすることによってVPC GWの設定ができる。D社では、VPC GWとFWに次の設計1を設定している。

- VPC GW 設定項目：VPC内仮想セグメントのアドレス（192.168.1.0/24）、IPsec VPN認証用の共通「a」、FWの外部アドレス（t.u.v.5）、D社内ネットワークアドレス（172.16.0.0/16、172.17.0.0/16）

- FW 設定項目：VPC内仮想セグメントのアドレス（192.168.1.0/24）、IPsec VPN認証用の共通「a」、VPC GWの外部アドレス（x.y.z.1）、D社内ネットワークアドレス（172.16.0.0/16、172.17.0.0/16）

## OSPFによる経路制御

OSPFは、リンクステート型のルーティングプロトコルである。OSPFルータは、隣接するルータ間にてリンクステートアドバタイズメント（以下、LSAという）と呼ばれる情報を交換することによって、ネットワーク内のリンク情報を集め、ネットワークトポロジのデータベースLSDB（Link State Database）を構築する。LSAには幾つかの種類があり、それぞれのTypeが定められている。例えば、「b」LSAと呼ばれるType1のLSAは、OSPFエリア内の「b」に関する情報であり、その情報には、「c」と呼ばれるメトリック値などが含まれている。また、Type2のLSAは、ネットワークLSAと呼ばれる。OSPFエリア内の各ルータは、集められたLSAの情報を基にして、「d」アルゴリズムを用いた最短経路評価を行って、ルーティングテーブルを動的に作成する。さらに、OSPFには、③複数の経路情報を一つに集約する機能（以下、経路集約機能という）がある。D社では、支社へのネットワーク経路を集約することを「前提」として、③ある特定のネットワーク機器で経路集約機能を設定している（以下、この集約設定を支社ネットワーク集約という）。支社ネットワーク集約がされた状態で、本社のLS3Wの経路テーブルを見ると、a～gのそれぞれを宛先とする経路（以下、支社個別経路という）が一つに集約された、「c」/16を宛先とする経路が確認できる。また、D社では、支社ネットワーク集約によって意図しない②ルーティンググループが発生してしまうことを防ぐための設定を行っているが、その設定の結果、表2に示すOSPF経路が除去され、ルーティングループが防止される。

### 表 2 ルーティングループを防ぐ OSPF 経路

| 設定箇所 | 宛先ネットワークアドレス | ネクストホップ |
|----------|--------------------------|---------------|
| f        | g                        | Null0         |

注記 Null0 はパケットを捨てることを示す。

## [D社とE社のネットワーク統合の検討]

D社とE社のネットワーク統合を実現するために、情報システム部のFさんが検討することになった。Fさんは、E社の現行のネットワークについての情報を集め、次のようにまとめた。

- E社のオフィスは、本社1拠点だけである。
- E社の本社は、D社の支社1と同一ビル内の別フロアにオフィスを構えている。
- E社の社内システム（以下、E社社内システムという）は、クラウドサービス事業者であるH社のVPC内にある仮想サーバ上でWebシステムとして構築されている。
- E社のPCは、インターネットVPNを介して、E社社内システムにアクセスしている。
- E社のネットワークの経路制御はOSPFで行っており1全体がOSPFエリア0である。
- E社のネットワークのIPアドレスブロックは、172.18.0.0/16を利用している。

情報システム部は、Fさんの調査を基にして、E社のネットワークをD社に統合するための次の方針を立てた。

1. ネットワーク統合後の円滑な業務の開始が必要なので、既存ネットワークからの構成変更は最小限とする。
2. E社のネットワークとD社の支社1ネットワークを同一ビルのフロアの間で接続する（以下、この接続をフロア間接続という）。
3. フロア間接続のために、D社の支社1のL3SW1とE社のL3SW6の間に新規サブネットを作成する。当該新規サブネット部分のアドレスは、E社のIPアドレスブロックから新たに割り当てる。新規サブネット部分のOSPFエリアは0とする。
4. 両社のOSPFを一つのルーティングドメインとする。
5. H社VPC内の仮想サーバはG社VPCに移設し、統合後の全社から利用する。
6. E社がこれまで利用してきたインターネット接続制限及びH社VPCについては契約を解除する。

Fさんの考えた統合後のネットワーク構成を図2に示す。

![Local Image](picture-1.png)

図2 Fさんの考えた統合後のネットワーク構成

Fさんは、両社間の接続について更に検討を行い、課題を次のとおりまとめた。

- フロア間を接続しただけでは、OSPFエリア0がOSPFエリア1によって2つに分断されたエリア構成となる。そのため、フロア間接続を行っても「⑤」E社のネットワークからの通信が到達できないD社内のネットワーク部分が生じ、E社からインターネットへのアクセスもできない。
- 「⑥」NW機器のOSPF関連の追加の設定（以下、フロア間OSPF追加設定という）を行う必要がある。
- フロア間接続及びフロア間OSPF追加設定を行った場合、D社側のOSPFエリア0とE社側のOSPFエリア0は両方合わせて1つのOSPFエリア0となる。このとき、フロア間OSPF追加設定を行う2台の機器はいずれもエリア境界ルータである。また、OSPFエリアの構成としては、OSPFエリア0とOSPFエリア1がこれらの2台のエリア境界ルータで並列に接続された形となる。その結果、D社ネットワークで行われていた支社ネットワーク集約の効果がなくなり、E社のOSPFエリア0のネットワーク内に支社個別経路が現れてしまう。それを防ぐためには、②ネットワーク機器への追加の設定が必要である。
- E社のネットワークセグメントから仮想サーバへのアクセスを可能とするためには、FWとVPC GWに対してE社のアドレスを追加で設定することが必要である。

これらの課題の対応で、両社のネットワーク全体の経路制御が行えるようになることを報告したところ、検討結果が承認され、ネットワーク統合プロジェクトリーダにFさんが任命された。

## 設問

### 設問1

本文中の「a」~「e」に入れる適切な字句を答えよ。

### 設問2

本文中の下線①について、設定の内容を 25 字以内で述べよ。

### 設問3

「OSPF による経路制御」について、(1)〜(4) に答えよ。

1. 本文中の下線②について、この機能を使って経路を集約する目的を 25 字以内で述べよ。
2. 本文中の下線③について、経路集約を設定している機器を図 1 中の機器名で答えよ。
3. 本文中の下線④について、ルーティングループが発生する可能性があるのは、どの機器とどの機器の間か。この 2 つの機器を図 1 中の機器名で答えよ。
4. 表 2 中の「f」「g」に入れる適切な字句を答えよ。

### 設問4

[D 社と E 社のネットワーク統合の検討]について、(1)〜(3)に答えよ。

1. 本文中の下線⑤について、到達できない D 社内ネットワーク部分を、図 2 中の a〜l の記号で全て答えよ。
2. 本文中の下線⑥について、フロア間 OSPF 追加設定を行う必要がある 1 つの機器を答えよ。また、その設定内容を 25 字以内で述べよ。
3. 本文中の下線⑦について、設定が必要なネットワーク機器を答えよ。また、その設定内容を 40 字以内で述べよ。
        `;
        setMarkdownText(initialMarkdown);
    }, []);

    const handleDownload = () => {
        const element = document.createElement('a');
        const file = new Blob([markdownText], { type: 'text/markdown' });
        element.href = URL.createObjectURL(file);
        element.download = 'sample.md';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    return (
        <div className="min-h-screen flex flex-col pt-16"> {/* ヘッダー分の余白を追加 */}
            <Card className="shadow-sm bg-white rounded-lg border border-gray-200 flex flex-col flex-grow">
                <div className="flex flex-grow overflow-hidden">
                    {/* 左側: マークダウンプレビュー */}
                    <div className="w-2/3 flex-1 flex flex-col pl-5">
                        <div className="flex justify-between items-center mb-3 mt-5">
                            <button
                            className="bg-gray-300 text-gray-700 py-1 px-3 rounded-md hover:bg-gray-400 transition font-medium"
                            onClick={() => setIsMarkdown(!isMarkdown)}
                            >
                            {isMarkdown ? "生データ表示" : "マークダウン表示"}
                            </button>
                        </div>

                        <div
                            className="border p-4 bg-gray-50 rounded-md overflow-auto"
                            style={{ height: 'calc(100vh - 140px)' }} // ヘッダーとその他要素の高さを除く
                        >    
                            {isMarkdown ? (
                                <ReactMarkdown className="markdown">{markdownText}</ReactMarkdown>
                            ) : (
                                <pre className="text-sm text-gray-800 whitespace-pre-wrap">{markdownText}</pre>
                            )}
                            
                        </div>


                    </div>

                    {/* 右側: チャットエリア */}
                    <div className="w-1/3 p-4 flex flex-col">
                        <Textarea
                            className="flex-grow mb-4"
                            placeholder="ここに論文に関するチャットメッセージが表示されます"
                            value={chatText}
                            onChange={(e) => setChatText(e.target.value)}
                            rows={15}
                        />
                        <Button className="w-full" disabled={!chatText}>
                            メッセージを送信
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}

export default PaperMarkdownView;

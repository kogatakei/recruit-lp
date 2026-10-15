# HERP応募完了をMetaで別計測する

## 計測の定義

- LINE友だち追加は既存のLステップ連携で `CompleteRegistration` として送信し、広告セットの最適化対象を変更しません。
- HERP求人99の応募完了は別の標準イベント `SubmitApplication` として、同じMetaピクセルへ送信します。HERPのリンククリックや求人ページ閲覧は応募完了に含めません。
- Meta広告マネージャーでは `CompleteRegistration` と `SubmitApplication` を別々に確認します。これらを足した数字は人物単位で重複排除されません。同じ方が両方を行った場合はそれぞれ1件です。
- 「1人1件の合算CV」を厳密に実現するには、LINEとHERPの共通人物IDと、LステップのMeta直接送信を置き換える共通の重複判定が必要です。既存のLINE導線を変えない方針のため、今回は合算CVを作りません。

## 有効化前に必要なこと

1. HERP管理者がHERP Hire APIの利用申請と追加規約への同意を行い、`candidacy:read` スコープのAPIキーを発行する。利用には対象プランの確認も必要です。
2. HERP APIで求人99の実応募を1件確認し、求人ページ経由の `channel.type` の実際の値を調べる。手動追加や別媒体からの応募を混ぜないため、推測値では有効化しません。
3. Metaイベントマネージャーで対象ピクセルのConversions APIトークンを用意する。
4. 応募者のメールアドレスを正規化・SHA-256ハッシュ化してMetaへ送ることについて、社内の個人情報の取り扱いと応募者向けの告知を確認する。ユーザーはこの方式を了承済みです。ハッシュ化後も慎重に扱います。
5. Vercelの本番環境変数に以下を設定する。鍵はGitHubやチャットに貼らない。

| 変数 | 値 |
| --- | --- |
| `CRON_SECRET` | 16文字以上のランダムな秘密値 |
| `HERP_API_KEY` | HERP管理者が発行した読取専用APIキー |
| `HERP_REQUISITION_ID` | 求人99の職種ID（`6f6144cc-a70c-43d2-aa2c-79d6b406d921`） |
| `HERP_CHANNEL_TYPE` | 実応募で確認した求人ページ経由の `channel.type` |
| `HERP_EVENT_SOURCE_URL` | `https://herp.careers/v1/crazy/5PNALVuXyI30`（限定公開トークンなし） |
| `META_CAPI_TOKEN` | 対象ピクセルのCAPIトークン |
| `META_PIXEL_ID` | `2136969587217791` |
| `HERP_META_ENABLED` | 検証・承認後に `true` にする。それまでは未設定 |

## 動作と検証

- Vercel Cronが毎日00:00 UTC（日本時間09:00）に前日の応募を取得し、求人IDと応募経路を絞ります。
- Metaへ送るのはイベント名、応募日時、応募ID由来の重複防止ID、HERP求人URL、ハッシュ化メールアドレスのみです。氏名・電話番号・履歴書・選考結果は送りません。
- Metaのテストイベントで `SubmitApplication` の受信を確認し、その後HERPの実応募件数とMetaの受信件数を照合します。広告マネージャーに表示される件数はMeta広告に帰属した分であり、HERPの総応募数とは一致しない場合があります。
- 旧 `CompleteRegistration` 条件のカスタムコンバージョン（ID `2306253853464788`）はMeta上で「未使用_旧案_HERP応募CV」と表示しています。新しい `SubmitApplication` が受信された後、HERP求人URLで絞る新しい内訳用カスタムコンバージョンを作成します。

## 制限

- HERP APIキーと実応募の `channel.type` がない間は送信を開始できません。
- 応募からMeta反映まで最大約1日かかります。メールアドレスだけでの広告照合率は実測して判断します。
- 日次同期が失敗した日の再実行手順を用意してから本番運用にします。

# Security

## 報告対象

秘密情報の露出、任意スクリプト実行、保存データの意図しない外部送信など、利用者へ影響する問題を対象にします。

## 報告方法

公開Issueへ秘密情報や個人情報を書かないでください。GitHubのPrivate vulnerability reportingが利用できる場合は、リポジトリのSecurityタブから報告してください。

公開版は外部APIへ学習ログを送信せず、進捗をブラウザの`localStorage`へ保存します。

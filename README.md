# bizdev-task
## Overview
毎日9時,19時半にnotionからタスクを取得し、Slackに通知するbot
### 通知されるタスク
- 本日締め切りのタスク
- 期限が過ぎているタスク
- 新たに追加されたタスク(あれば)
- 期日が設定されていないタスク(あれば)

## How to run
最初に `.env` ファイルをもらってください
```
$ git clone <THIS REPOSITORY>
$ npm install
$ npm run start (slackに通知が飛んでしまうため注意が必要)
```

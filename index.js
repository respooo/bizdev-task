const { Client } = require('@notionhq/client');
const Dotenv = require('dotenv');
const { WebClient } = require('@slack/web-api');

const main = async () => {
    Dotenv.config();

    // Get today limit tasks from notion
    const notion = new Client({
        auth: process.env.NOTION_AUTH_KEY,
    });
    const res = await notion.databases.query({ database_id: process.env.NOTION_DATABASE_ID });
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const todayTasks = res.results.filter((result) => result.properties['期限'].date?.start === todayKey);
    const expiredTasks = res.results.filter((result) => {
        const expire = result.properties['期限'].date?.start;
        if (!expire) return false;
        const splitted = expire.split('-');
        const expireDate = new Date(splitted[0], Number(splitted[1]) - 1, splitted[2]);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const isDone = result.properties['Status'].multi_select.filter((select) => select.name.includes('Done')).length !== 0;
        return expireDate < today && !isDone;
    });

    // Send message to slack
    const slackClient = new WebClient(process.env.SLACK_API_TOKEN);
    await slackClient.chat.postMessage({
        channel: '#biz-all',
        text:
            `📍今日締め切りのタスクがあります！\n` +
            todayTasks.map((todayTask) => `<${todayTask.url}|${todayTask.properties['名前'].title[0]?.plain_text ?? "タスク"}>`).join('\n') + '\n\n' +
            `🚨↓のタスクは期限が過ぎています！\n` +
            expiredTasks.map((expiredTask) => `<${expiredTask.url}|${expiredTask.properties['名前'].title[0]?.plain_text ?? "タスク"}> ~${expiredTask.properties['期限'].date?.start}`).join('\n')
    });
}

main();

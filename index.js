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

    // Send message to slack
    const slackClient = new WebClient(process.env.SLACK_API_TOKEN);
    await slackClient.chat.postMessage({
        channel: '#biz-all',
        text:
            `今日締め切りのタスクがあります！\n` +
            todayTasks.map((todayTask) => `<${todayTask.url}|${todayTask.properties['名前'].title[0]?.plain_text ?? "タスク"}>`).join('\n')
    });
}

main();

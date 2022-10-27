const { Client } = require('@notionhq/client');
const Dotenv = require('dotenv');

const main = async () => {
    Dotenv.config();
    const notion = new Client({
        auth: process.env.NOTION_AUTH_KEY,
    });

    const res = await notion.databases.query({ database_id: process.env.NOTION_DATABASE_ID });
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const todayTasks = res.results.filter((result) => result.properties['期限'].date?.start === todayKey);
    console.log(todayTasks.length);
}

main();

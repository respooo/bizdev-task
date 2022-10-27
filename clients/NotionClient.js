const { Client } = require('@notionhq/client');

class NotionClient {
    constructor(apiKey) {
        this.users = [];
        this.notion = new Client({
            auth: apiKey,
        });
    }

    async getAllTasks(databaseId) {
        const res = await this.notion.databases.query({database_id: databaseId});
        return res.results;
    }

    async getPage(pageId) {
        const res = await this.notion.pages.retrieve({page_id: pageId});
        return res;
    }
}

module.exports = {
    NotionClient,
}

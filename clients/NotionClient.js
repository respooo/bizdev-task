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

    async getUser(userId) {
        const res = await this.notion.users.retrieve({ user_id: userId });
        return res;
    }
}

module.exports = {
    NotionClient,
}

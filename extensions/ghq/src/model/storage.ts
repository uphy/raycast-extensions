import { LocalStorage } from "@raycast/api";

const MAX_HISTORY_SIZE = 10;

export type SavedQuery = {
  id: string;
  name: string;
  query: string;
};

export type RepositoryData = {
  queryHistory: string[];
  savedQueries: SavedQuery[];
};

export const storage = new (class {
  private async setRepo(path: string, RepositoryData: RepositoryData) {
    await LocalStorage.setItem("r:" + path, JSON.stringify(RepositoryData));
  }

  private async getRepo(path: string): Promise<RepositoryData | undefined> {
    const repoJson = await LocalStorage.getItem<string>("r:" + path);
    if (!repoJson) {
      return undefined;
    }
    return JSON.parse(repoJson) as RepositoryData;
  }

  private async getOrCreateRepositoryData(path: string): Promise<RepositoryData> {
    let r = await this.getRepo(path);
    if (!r) {
      r = { queryHistory: [], savedQueries: [] };
      await this.setRepo(path, r);
    }
    return r;
  }

  async pushQueryHistory(repo: string, query: string): Promise<void> {
    const data = await this.getOrCreateRepositoryData(repo);
    const queryHistory = data.queryHistory;

    // Remove the query if it already exists
    const index = queryHistory.indexOf(query);
    if (index !== -1) {
      queryHistory.splice(index, 1);
    }
    // Add the query to the beginning of the history
    queryHistory.unshift(query);
    // Limit the history size
    if (queryHistory.length > MAX_HISTORY_SIZE) {
      queryHistory.pop();
    }

    data.queryHistory = queryHistory;
    await this.setRepo(repo, data);
  }

  async getQueryHistory(repo: string): Promise<string[]> {
    const data = await this.getOrCreateRepositoryData(repo);
    return data.queryHistory;
  }

  async deleteQueryHistory(repo: string, query: string): Promise<void> {
    const data = await this.getOrCreateRepositoryData(repo);
    const queryHistory = data.queryHistory;
    const index = queryHistory.indexOf(query);
    if (index !== -1) {
      queryHistory.splice(index, 1);
      data.queryHistory = queryHistory;
      await this.setRepo(repo, data);
    }
  }

  async getSavedQueries(repo: string): Promise<SavedQuery[]> {
    const data = await this.getOrCreateRepositoryData(repo);
    return data.savedQueries;
  }

  async addSavedQuery(repo: string, savedQuery: SavedQuery): Promise<void> {
    const data = await this.getOrCreateRepositoryData(repo);
    data.savedQueries.push(savedQuery);
    await this.setRepo(repo, data);
  }

  async updateSavedQuery(repo: string, savedQuery: SavedQuery): Promise<void> {
    const data = await this.getOrCreateRepositoryData(repo);
    const savedQueries = data.savedQueries;
    const index = savedQueries.findIndex((q) => q.id === savedQuery.id);
    if (index !== -1) {
      savedQueries[index] = savedQuery;
      data.savedQueries = savedQueries;
      await this.setRepo(repo, data);
    }
  }

  async moveUpDownSavedQuery(repo: string, savedQuery: SavedQuery, direction: "up" | "down"): Promise<void> {
    const data = await this.getOrCreateRepositoryData(repo);
    const savedQueries = data.savedQueries;
    const index = savedQueries.findIndex((q) => q.id === savedQuery.id);
    if (index === -1) {
      return;
    }
    if (direction === "up") {
      await this.moveSavedQuery(repo, index, index - 1);
    } else {
      await this.moveSavedQuery(repo, index, index + 1);
    }
  }

  private async moveSavedQuery(repo: string, fromIndex: number, toIndex: number): Promise<void> {
    const data = await this.getOrCreateRepositoryData(repo);
    const savedQueries = data.savedQueries;
    if (
      fromIndex < 0 ||
      fromIndex >= savedQueries.length ||
      toIndex < 0 ||
      toIndex >= savedQueries.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const [removed] = savedQueries.splice(fromIndex, 1);
    savedQueries.splice(toIndex, 0, removed);
    data.savedQueries = savedQueries;
    await this.setRepo(repo, data);
  }

  async deleteSavedQuery(repo: string, id: string): Promise<void> {
    const data = await this.getOrCreateRepositoryData(repo);
    const savedQueries = data.savedQueries;
    const index = savedQueries.findIndex((q) => q.id === id);
    if (index !== -1) {
      savedQueries.splice(index, 1);
      data.savedQueries = savedQueries;
      await this.setRepo(repo, data);
    }
  }
})();

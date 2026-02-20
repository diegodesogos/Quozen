import { IStorageLayer } from "./IStorageLayer";
import { Group, User } from "../domain/models";
import { UserSettings, CachedGroup, QUOZEN_PREFIX, SETTINGS_FILE_NAME, REQUIRED_SHEETS, MemberInput } from "../types";

export class GroupRepository {
    constructor(private storage: IStorageLayer, private user: User) { }

    async getSettings(): Promise<UserSettings> {
        const files = await this.storage.listFiles(`name = '${SETTINGS_FILE_NAME}' and trashed = false`);
        if (files.length > 0) {
            try {
                const data = await this.storage.getFile(files[0].id, { alt: 'media' });
                if (data && data.version) return data as UserSettings;
            } catch (e) {
                // Fall through to reconcile
            }
        }
        return this.reconcileGroups();
    }

    async saveSettings(settings: UserSettings): Promise<void> {
        settings.lastUpdated = new Date().toISOString();
        const files = await this.storage.listFiles(`name = '${SETTINGS_FILE_NAME}' and trashed = false`);
        if (files.length > 0) {
            await this.storage.updateFile(files[0].id, {}, JSON.stringify(settings));
        } else {
            await this.storage.createFile(SETTINGS_FILE_NAME, "application/json", {}, JSON.stringify(settings));
        }
    }

    async reconcileGroups(): Promise<UserSettings> {
        const files = await this.storage.listFiles(`properties has { key='quozen_type' and value='group' } and trashed = false`);
        const visibleGroups: CachedGroup[] = files.map(file => ({
            id: file.id,
            name: file.name.startsWith(QUOZEN_PREFIX) ? file.name.slice(QUOZEN_PREFIX.length) : file.name,
            role: (file.owners?.some((o: any) => o.emailAddress === this.user.email) || file.capabilities?.canDelete) ? "owner" as const : "member" as const,
            lastAccessed: file.createdTime
        })).sort((a, b) => new Date(b.lastAccessed || 0).getTime() - new Date(a.lastAccessed || 0).getTime());

        const settings: UserSettings = {
            version: 1,
            activeGroupId: visibleGroups[0]?.id || null,
            groupCache: visibleGroups,
            preferences: { defaultCurrency: "USD", theme: "system" },
            lastUpdated: new Date().toISOString()
        };
        await this.saveSettings(settings);
        return settings;
    }

    async create(name: string, members: MemberInput[] = []): Promise<Group> {
        const title = `${QUOZEN_PREFIX}${name}`;
        const fileId = await this.storage.createSpreadsheet(title, [...REQUIRED_SHEETS], { quozen_type: 'group', version: '1.0' });

        const initialMembers = [
            [this.user.id || "unknown", this.user.email, this.user.name, "owner", new Date().toISOString()]
        ];

        for (const member of members) {
            let memberName = member.username || member.email || "Unknown";
            let memberId = member.email || member.username || `user-${(typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString())}`;
            if (member.email) {
                const perm = await this.storage.createPermission(fileId, "writer", "user", member.email);
                if (perm.displayName) memberName = perm.displayName;
                memberId = member.email;
            }
            initialMembers.push([memberId, member.email || "", memberName, "member", new Date().toISOString()]);
        }

        const dataToUpdate = [
            { range: "Expenses!A1", values: [["id", "date", "description", "amount", "paidBy", "category", "splits", "meta"]] },
            { range: "Settlements!A1", values: [["id", "date", "fromUserId", "toUserId", "amount", "method", "notes"]] },
            { range: "Members!A1", values: [["userId", "email", "name", "role", "joinedAt"]] },
            { range: "Members!A2", values: initialMembers }
        ];

        await this.storage.batchUpdateValues(fileId, dataToUpdate);

        const settings = await this.getSettings();
        settings.groupCache.unshift({ id: fileId, name, role: "owner", lastAccessed: new Date().toISOString() });
        settings.activeGroupId = fileId;
        await this.saveSettings(settings);

        return {
            id: fileId, name, description: "Google Sheet Group",
            createdBy: "me",
            participants: initialMembers.map(m => m[0]),
            createdAt: new Date(),
            isOwner: true
        };
    }
}

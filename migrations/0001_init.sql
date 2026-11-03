PRAGMA foreign_keys=ON;
CREATE TABLE projects (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, origin TEXT NOT NULL,
 linear_team_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE ideas (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
 title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','considering','planned','building','ready','shipped','declined')),
 linear_id TEXT UNIQUE, linear_url TEXT, promotion_state TEXT NOT NULL DEFAULT 'idle',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE submissions (
 id TEXT PRIMARY KEY, idea_id TEXT NOT NULL REFERENCES ideas(id),
 body TEXT NOT NULL, email TEXT, notify INTEGER NOT NULL DEFAULT 0 CHECK(notify IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX submissions_idea ON submissions(idea_id);
CREATE INDEX ideas_project ON ideas(project_id,created_at);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires INTEGER NOT NULL);

DROP TABLE IF EXISTS users;
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, phone TEXT, email TEXT, password TEXT, salt TEXT);
INSERT INTO "users" VALUES(1,'Evan Griffiths','6466754529','griffithse@gmail.com','e3838f03c7f9e3782a2bf8258f6fa89faaa317ea8d56662e1714db5908fdd412','
ò«Ñmçì­ÒRUç');

DROP TABLE IF EXISTS alarms;
CREATE TABLE alarms (id INTEGER PRIMARY KEY, time INTEGER, excuse_id INTEGER, user_id INTEGER);

DROP TABLE IF EXISTS excuses;
CREATE TABLE excuses (id INTEGER PRIMARY KEY, title TEXT, trigger TEXT, message TEXT);
INSERT INTO excuses (title,trigger,message) VALUES
("Mom's leg","mom", "Mom broke her leg!"),
("Website","website", "Website is down!"),
("Wife keys","keys", "Wife got locked out of the house");
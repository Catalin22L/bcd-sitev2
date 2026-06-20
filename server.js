require("dotenv").config();
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Conectare/Creare Bază de Date SQLite locală
const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Eroare la deschiderea bazei de date SQLite:", err.message);
  } else {
    console.log("Conectat cu succes la baza de date SQLite locală.");
    // Activăm suportul pentru Foreign Keys (obligatoriu în SQLite pentru relații)
    db.run("PRAGMA foreign_keys = ON", (err) => {
      if (err) console.error("Eroare activare Foreign Keys", err.message);
    });
    initializeDatabase();
  }
});

// Helper functions pentru a folosi async/await cu sqlite3
const runQuery = (query, params = []) => new Promise((resolve, reject) => {
  db.run(query, params, function (err) {
    if (err) reject(err); else resolve(this);
  });
});
const getQuery = (query, params = []) => new Promise((resolve, reject) => {
  db.get(query, params, (err, row) => {
    if (err) reject(err); else resolve(row);
  });
});
const allQuery = (query, params = []) => new Promise((resolve, reject) => {
  db.all(query, params, (err, rows) => {
    if (err) reject(err); else resolve(rows);
  });
});

// Inițializare tabele (Model Relațional 1-la-N)
async function initializeDatabase() {
  try {
    await runQuery(`CREATE TABLE IF NOT EXISTS Facultati (
      id_facultate INTEGER PRIMARY KEY AUTOINCREMENT,
      nume_facultate TEXT NOT NULL UNIQUE
    )`);

    await runQuery(`CREATE TABLE IF NOT EXISTS Specializari (
      id_specializare INTEGER PRIMARY KEY AUTOINCREMENT,
      nume_specializare TEXT NOT NULL,
      id_facultate INTEGER NOT NULL,
      FOREIGN KEY (id_facultate) REFERENCES Facultati(id_facultate),
      UNIQUE(nume_specializare, id_facultate)
    )`);

    await runQuery(`CREATE TABLE IF NOT EXISTS Participanti (
      id_participant INTEGER PRIMARY KEY AUTOINCREMENT,
      nume_complet TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      telefon TEXT NOT NULL,
      an_studiu TEXT NOT NULL,
      id_specializare INTEGER NOT NULL,
      data_inscriere DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_specializare) REFERENCES Specializari(id_specializare)
    )`);

    console.log("Tabelele relaționale au fost inițializate cu succes.");
  } catch (err) {
    console.error("Eroare la crearea tabelelor:", err.message);
  }
}

// Middleware de verificare Admin
function checkAdminAuth(req, res, next) {
  const authHeader = req.headers["x-admin-password"];
  if (!authHeader || authHeader !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Neautorizat. Parolă admin incorectă." });
  }
  next();
}

// === Rute API ===

// 1. Înregistrare Participant (Integrare în cele 3 tabele)
app.post("/api/register", async (req, res) => {
  const { nume, email, telefon, facultate, an_studiu, specializare } = req.body;

  // Validare de bază
  if (!nume || !email || !telefon || !facultate || !an_studiu || !specializare) {
    return res.status(400).json({ error: "Toate câmpurile sunt obligatorii." });
  }

  // Validare email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Adresa de email nu este validă." });
  }

  // Validare telefon
  const phoneRegex = /^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$/;
  if (!phoneRegex.test(telefon) || telefon.length < 8) {
    return res.status(400).json({ error: "Numărul de telefon nu este valid." });
  }

  try {
    // 1. Verificăm sau inserăm Facultatea
    let fac = await getQuery(`SELECT id_facultate FROM Facultati WHERE nume_facultate = ?`, [facultate]);
    if (!fac) {
      const facRes = await runQuery(`INSERT INTO Facultati (nume_facultate) VALUES (?)`, [facultate]);
      fac = { id_facultate: facRes.lastID };
    }

    // 2. Verificăm sau inserăm Specializarea (legată de Facultate)
    let spec = await getQuery(`SELECT id_specializare FROM Specializari WHERE nume_specializare = ? AND id_facultate = ?`, [specializare, fac.id_facultate]);
    if (!spec) {
      const specRes = await runQuery(`INSERT INTO Specializari (nume_specializare, id_facultate) VALUES (?, ?)`, [specializare, fac.id_facultate]);
      spec = { id_specializare: specRes.lastID };
    }

    // 3. Inserăm Participantul (legat de Specializare)
    const partRes = await runQuery(
      `INSERT INTO Participanti (nume_complet, email, telefon, an_studiu, id_specializare) VALUES (?, ?, ?, ?, ?)`,
      [nume, email, telefon, an_studiu, spec.id_specializare]
    );

    res.status(201).json({
      success: true,
      message: "Înregistrare salvată cu succes!",
      id: partRes.lastID,
    });
  } catch (err) {
    console.error("Eroare la inserare DB:", err.message);
    // Eroare pentru constrângerea de email unic (din cursul 9-10)
    if (err.message.includes("UNIQUE constraint failed: Participanti.email")) {
      return res.status(400).json({ error: "Această adresă de email este deja înregistrată!" });
    }
    res.status(500).json({ error: "A apărut o eroare la salvarea înregistrării." });
  }
});

// 2. Login Admin (Validează parola)
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Parola este obligatorie." });
  }
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, message: "Autentificare reușită." });
  } else {
    res.status(401).json({ error: "Parolă incorectă." });
  }
});

// 3. Obține toate înscrierile (Folosim JOIN pentru a recompune datele)
app.get("/api/admin/registrations", checkAdminAuth, async (req, res) => {
  const query = `
    SELECT 
      p.id_participant as id, 
      p.nume_complet as nume, 
      p.email, 
      p.telefon, 
      p.an_studiu, 
      p.data_inscriere as timestamp,
      s.nume_specializare as specializare, 
      f.nume_facultate as facultate
    FROM Participanti p
    JOIN Specializari s ON p.id_specializare = s.id_specializare
    JOIN Facultati f ON s.id_facultate = f.id_facultate
    ORDER BY p.data_inscriere DESC
  `;

  try {
    const rows = await allQuery(query);
    res.json(rows);
  } catch (err) {
    console.error("Eroare la citirea înregistrărilor:", err.message);
    res.status(500).json({ error: "Eroare la citirea datelor." });
  }
});

// 4. Șterge o înscriere
app.delete("/api/admin/registrations/:id", checkAdminAuth, async (req, res) => {
  const { id } = req.params;
  const query = `DELETE FROM Participanti WHERE id_participant = ?`;

  try {
    const result = await runQuery(query, [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Înregistrarea nu a fost găsită." });
    }
    res.json({ success: true, message: "Înregistrare ștearsă cu succes." });
  } catch (err) {
    console.error("Eroare la ștergerea înregistrării:", err.message);
    res.status(500).json({ error: "Eroare la ștergerea înregistrării." });
  }
});

// 5. Statistici înscrieri
app.get("/api/admin/stats", checkAdminAuth, async (req, res) => {
  try {
    const stats = {};

    // Total
    const totalRow = await getQuery("SELECT COUNT(*) as total FROM Participanti");
    stats.total = totalRow ? totalRow.total : 0;

    // Facultăți (JOIN pentru a lua numele facultății)
    stats.facultati = await allQuery(`
        SELECT f.nume_facultate as facultate, COUNT(p.id_participant) as count 
        FROM Participanti p
        JOIN Specializari s ON p.id_specializare = s.id_specializare
        JOIN Facultati f ON s.id_facultate = f.id_facultate
        GROUP BY f.nume_facultate
      `);

    // Ani de studiu
    stats.ani = await allQuery("SELECT an_studiu, COUNT(*) as count FROM Participanti GROUP BY an_studiu");

    res.json(stats);
  } catch (err) {
    console.error("Eroare statistici:", err);
    res.status(500).json({ error: "Eroare la calcularea statisticilor." });
  }
});

// Ruta fallback pentru a servi index.html dacă e accesat ca SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Pornire server
app.listen(PORT, () => {
  console.log(`Serverul rulează pe http://localhost:${PORT}`);
  console.log(`Panoul admin este disponibil la http://localhost:${PORT}/admin.html`);
});
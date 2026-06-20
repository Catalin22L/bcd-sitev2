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
    initializeDatabase();
  }
});

// Inițializare tabelă
function initializeDatabase() {
  db.run(
    `CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nume TEXT NOT NULL,
      email TEXT NOT NULL,
      telefon TEXT NOT NULL,
      facultate TEXT NOT NULL,
      an_studiu TEXT NOT NULL,
      specializare TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    (err) => {
      if (err) {
        console.error("Eroare la crearea tabelei 'registrations':", err.message);
      } else {
        console.log("Tabela 'registrations' este pregătită.");
      }
    }
  );
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

// 1. Înregistrare Participant
app.post("/api/register", (req, res) => {
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

  // Validare telefon (cifre, spații, plus, paranteze)
  const phoneRegex = /^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$/;
  if (!phoneRegex.test(telefon) || telefon.length < 8) {
    return res.status(400).json({ error: "Numărul de telefon nu este valid." });
  }

  const query = `INSERT INTO registrations (nume, email, telefon, facultate, an_studiu, specializare) VALUES (?, ?, ?, ?, ?, ?)`;

  db.run(query, [nume, email, telefon, facultate, an_studiu, specializare], function (err) {
    if (err) {
      console.error("Eroare la inserarea înregistrării:", err.message);
      return res.status(500).json({ error: "A apărut o eroare la salvarea înregistrării." });
    }
    res.status(201).json({
      success: true,
      message: "Înregistrare salvată cu succes!",
      id: this.lastID,
    });
  });
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

// 3. Obține toate înscrierile
app.get("/api/admin/registrations", checkAdminAuth, (req, res) => {
  const query = `SELECT * FROM registrations ORDER BY timestamp DESC`;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error("Eroare la citirea înregistrărilor:", err.message);
      return res.status(500).json({ error: "Eroare la citirea datelor." });
    }
    res.json(rows);
  });
});

// 4. Șterge o înscriere
app.delete("/api/admin/registrations/:id", checkAdminAuth, (req, res) => {
  const { id } = req.params;
  const query = `DELETE FROM registrations WHERE id = ?`;

  db.run(query, id, function (err) {
    if (err) {
      console.error("Eroare la ștergerea înregistrării:", err.message);
      return res.status(500).json({ error: "Eroare la ștergerea înregistrării." });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "Înregistrarea nu a fost găsită." });
    }
    res.json({ success: true, message: "Înregistrare ștearsă cu succes." });
  });
});

// 5. Statistici înscrieri
app.get("/api/admin/stats", checkAdminAuth, (req, res) => {
  const stats = {};

  // Total
  db.get("SELECT COUNT(*) as total FROM registrations", [], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Eroare la calcularea statisticilor." });
    }
    stats.total = row ? row.total : 0;

    // Facultăți
    db.all("SELECT facultate, COUNT(*) as count FROM registrations GROUP BY facultate", [], (err, facRows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Eroare la calcularea statisticilor." });
      }
      stats.facultati = facRows;

      // Ani de studiu
      db.all("SELECT an_studiu, COUNT(*) as count FROM registrations GROUP BY an_studiu", [], (err, anRows) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Eroare la calcularea statisticilor." });
        }
        stats.ani = anRows;
        res.json(stats);
      });
    });
  });
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

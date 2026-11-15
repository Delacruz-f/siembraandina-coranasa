// Rutas de salud: /salud (JSON) y /salud/vivo (solo proceso, sin base de datos).
const express = require("express");
const { asyncHandler } = require("../../utils/asyncHandler");
const controlador = require("./salud.controller");

const router = express.Router();

router.get("/", asyncHandler(controlador.comprobar));

// "Liveness": confirma que el proceso está vivo aunque la base esté caída.
router.get("/vivo", (req, res) => res.json({ ok: true, estado: "vivo" }));

module.exports = router;

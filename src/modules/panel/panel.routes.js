// Rutas del panel principal.
const express = require("express");
const { asyncHandler } = require("../../utils/asyncHandler");
const { requiereSesion } = require("../../middlewares/autorizacion");
const controlador = require("./panel.controller");

const router = express.Router();

router.get("/panel", requiereSesion, asyncHandler(controlador.panel));

module.exports = router;

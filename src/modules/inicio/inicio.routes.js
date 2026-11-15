// Rutas públicas de inicio.
const express = require("express");
const { asyncHandler } = require("../../utils/asyncHandler");
const controlador = require("./inicio.controller");

const router = express.Router();

router.get("/", asyncHandler(controlador.mostrarInicio));

module.exports = router;

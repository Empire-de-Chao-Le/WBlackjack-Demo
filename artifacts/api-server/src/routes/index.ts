import { Router, type IRouter } from "express";
import healthRouter from "./health";
import songsRouter from "./songs";
import lyricsRouter from "./lyrics";
import autocompleteRouter from "./autocomplete";

const router: IRouter = Router();

router.use(healthRouter);
router.use(songsRouter);
router.use(lyricsRouter);
router.use(autocompleteRouter);

export default router;

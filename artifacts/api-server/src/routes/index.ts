import { Router, type IRouter } from "express";
import healthRouter from "./health";
import songsRouter from "./songs";
import lyricsRouter from "./lyrics";
import vocabRouter from "./vocab";
import autocompleteRouter from "./autocomplete";
import distractorsRouter from "./distractors";
import wordPoolRouter from "./word-pool";

const router: IRouter = Router();

router.use(healthRouter);
router.use(songsRouter);
router.use(lyricsRouter);
router.use(vocabRouter);
router.use(autocompleteRouter);
router.use(distractorsRouter);
router.use(wordPoolRouter);

export default router;

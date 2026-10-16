"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  barrierOptions,
  getBarrierLabel,
  getInterestLabel,
  interestOptions,
  resources,
  type BarrierId,
  type InterestId,
} from "../src/data/resources";
import { matchFirstStep, type MatchResult } from "../src/lib/matcher";

type Screen = "explore" | "result" | "passport";

const positiveStepsUrl = resources.find(
  (resource) => resource.id === "positive-steps-careers",
)?.url;
const participationUrl = resources.find(
  (resource) => resource.id === "gov-school-leaving",
)?.url;

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Progress({ screen }: { screen: Screen }) {
  const activeStep = screen === "explore" ? 1 : screen === "result" ? 2 : 3;

  return (
    <nav className="progress" aria-label="Your progress">
      {["Explore", "First step", "Passport"].map((label, index) => {
        const step = index + 1;
        const state = step === activeStep ? "current" : step < activeStep ? "complete" : "upcoming";
        return (
          <div className={`progress-step progress-step--${state}`} key={label} aria-current={state === "current" ? "step" : undefined}>
            <span className="progress-number">{state === "complete" ? "✓" : step}</span>
            <span>{label}</span>
          </div>
        );
      })}
    </nav>
  );
}

function ChoiceCard<T extends string>({
  name,
  id,
  label,
  value,
  selected,
  onChange,
}: {
  name: string;
  id: T;
  label: string;
  value: string;
  selected: boolean;
  onChange: (id: T) => void;
}) {
  return (
    <label className="choice-card">
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={() => onChange(id)}
      />
      <span className="choice-check" aria-hidden="true">{selected ? "✓" : ""}</span>
      <span>{label}</span>
    </label>
  );
}

function Timeline({ result }: { result: MatchResult }) {
  return (
    <ol className="timeline" aria-label="Your three-step pathway">
      {result.timeline.map((step, index) => (
        <li key={step.label}>
          <div className="timeline-topline">
            <span className="timeline-number">0{index + 1}</span>
            <span className="timeline-label">{step.label}</span>
          </div>
          <p>{step.action}</p>
        </li>
      ))}
    </ol>
  );
}

function buildPlanText(
  interest: InterestId,
  barrier: BarrierId,
  result: MatchResult,
  includeBarrier: boolean,
) {
  return [
    "MY FIRSTSTEP PASSPORT",
    `Interest: ${getInterestLabel(interest)}`,
    includeBarrier ? `What is getting in my way: ${getBarrierLabel(barrier)}` : null,
    `First action: ${result.firstAction}`,
    ...result.timeline.map((step) => `${step.label}: ${step.action}`),
    `Explore: ${result.resource.organisation} — ${result.resource.url}`,
    `Question to ask: ${result.questionToAsk}`,
    ...result.warnings.map((warning) => `Check: ${warning}`),
    "Guidance to explore options — not an eligibility decision or a confirmed place.",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("explore");
  const [interest, setInterest] = useState<InterestId | null>(null);
  const [barrier, setBarrier] = useState<BarrierId | null>(null);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [includeBarrier, setIncludeBarrier] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [copyFallback, setCopyFallback] = useState("");
  const interestGroupRef = useRef<HTMLFieldSetElement>(null);
  const barrierGroupRef = useRef<HTMLFieldSetElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const result = useMemo(
    () => (interest && barrier ? matchFirstStep(interest, barrier) : null),
    [interest, barrier],
  );

  useEffect(() => {
    mainRef.current?.querySelector<HTMLElement>("h1")?.focus();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }, [screen]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interest) {
      setFormError("Choose an interest to continue.");
      interestGroupRef.current?.focus();
      return;
    }
    if (!barrier) {
      setFormError("Choose what is getting in your way to continue.");
      barrierGroupRef.current?.focus();
      return;
    }
    setFormError("");
    setScreen("result");
  }

  function useAlexPreset() {
    setInterest("engineering");
    setBarrier("travel");
    setNote("");
    setFormError("");
    requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      barrierGroupRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    });
  }

  async function copyPlan() {
    if (!interest || !barrier || !result) return;
    const planText = buildPlanText(interest, barrier, result, includeBarrier);
    try {
      await navigator.clipboard.writeText(planText);
      setCopyStatus("Plan copied to your clipboard.");
      setCopyFallback("");
    } catch {
      setCopyStatus("Copy was blocked. Select the plan text below to copy it.");
      setCopyFallback(planText);
    }
  }

  function startAgain() {
    setScreen("explore");
    setInterest(null);
    setBarrier(null);
    setNote("");
    setFormError("");
    setIncludeBarrier(false);
    setCopyStatus("");
    setCopyFallback("");
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#main" aria-label="Oldham FirstStep home">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>Oldham <strong>FirstStep</strong></span>
        </a>
        <span className="prototype-pill">Independent prototype</span>
      </header>

      <Progress screen={screen} />

      <main id="main" ref={mainRef}>
        {screen === "explore" && (
          <section className="explore-screen" aria-labelledby="explore-title">
            <div className="hero-copy">
              <p className="eyebrow">Oldham FirstStep</p>
              <h1 id="explore-title" tabIndex={-1}>Your next step<br />starts <em>here.</em></h1>
              <p className="hero-lede">For 16–17-year-olds in Oldham. No CV needed.</p>
              <p className="hero-detail">Tell us what interests you and what&apos;s making it harder. Get one practical action, backed by real local support.</p>
              <button className="alex-button" type="button" onClick={useAlexPreset}>
                <span className="avatar" aria-hidden="true">A</span>
                <span><strong>Try Alex&apos;s story</strong><small>17 · Engineering · Travel</small></span>
                <span aria-hidden="true">→</span>
              </button>
              <div className="trust-row" aria-label="How this prototype works">
                <span>✓ No sign-up</span>
                <span>✓ Nothing saved</span>
                <span>✓ Real service links</span>
              </div>
            </div>

            <form className="explore-form" onSubmit={handleSubmit} noValidate>
              <div className="form-heading">
                <span>About 60 seconds</span>
                <p>Two choices. One doable step.</p>
              </div>

              <fieldset ref={interestGroupRef} tabIndex={-1}>
                <legend><span>1</span> What sounds most like you?</legend>
                <div className="choice-grid choice-grid--interest">
                  {interestOptions.map((option) => (
                    <ChoiceCard
                      key={option.id}
                      name="interest"
                      id={option.id}
                      value={option.id}
                      label={option.label}
                      selected={interest === option.id}
                      onChange={setInterest}
                    />
                  ))}
                </div>
              </fieldset>

              <fieldset ref={barrierGroupRef} tabIndex={-1}>
                <legend><span>2</span> What&apos;s getting in the way?</legend>
                <p className="field-help">Pick the main thing. You can change it later.</p>
                <div className="choice-grid choice-grid--barrier">
                  {barrierOptions.map((option) => (
                    <ChoiceCard
                      key={option.id}
                      name="barrier"
                      id={option.id}
                      value={option.id}
                      label={option.label}
                      selected={barrier === option.id}
                      onChange={setBarrier}
                    />
                  ))}
                </div>
              </fieldset>

              <label className="note-field">
                <span>Keep a thought for yourself <small>Optional</small></span>
                <input
                  type="text"
                  value={note}
                  maxLength={140}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="A note for yourself..."
                  aria-describedby="note-help note-count"
                />
              </label>
              <div className="note-meta">
                <span id="note-help">Not used for matching. Browser only. Don&apos;t include personal details.</span>
                <span id="note-count">{note.length}/140</span>
              </div>

              {formError && <p className="form-error" role="alert">{formError}</p>}
              <button className="primary-button" type="submit">Find my first step <span aria-hidden="true">→</span></button>
              <p className="engine-note">Rule-based personalised prototype · no live AI</p>
            </form>
          </section>
        )}

        {screen === "result" && interest && barrier && result && (
          <section className="result-screen" aria-labelledby="result-title">
            <div className="screen-intro">
              <p className="eyebrow">Your plan, not a prediction</p>
              <h1 id="result-title" tabIndex={-1}>Your first doable step</h1>
              <p>Built around what&apos;s getting in your way right now. Change it below and the plan changes with you.</p>
            </div>

            <article className="result-card" aria-live="polite">
              <div className="result-card-topline">
                <span className="result-kicker">Start here</span>
                <span className="source-badge">Official provider page · places &amp; eligibility not checked</span>
              </div>
              <p className="barrier-label">Because: {getBarrierLabel(barrier)}</p>
              <h2 data-testid="first-action">{result.firstAction}</h2>
              <div className="why-block">
                <span>Why this step</span>
                <p>{result.whyThisStep}</p>
              </div>
              <blockquote data-testid="question-to-ask">
                <span>What to ask</span>
                <p>{result.questionToAsk}</p>
              </blockquote>
              <div className="provider-row" data-testid="primary-provider">
                <span className="provider-mark" aria-hidden="true">↗</span>
                <div>
                  <small>Explore with</small>
                  <strong>{result.resource.organisation} · {result.resource.label}</strong>
                </div>
                <ExternalLink href={result.resource.url}>Open source</ExternalLink>
              </div>
              <div className="warning-row">
                {result.warnings.map((warning) => <span key={warning}>! {warning}</span>)}
              </div>
            </article>

            <section className="switcher-card" aria-labelledby="switcher-title">
              <div>
                <p className="mini-label">Try the difference</p>
                <h2 id="switcher-title">Change what&apos;s getting in the way</h2>
              </div>
              <div className="barrier-switcher">
                {barrierOptions.map((option) => (
                  <ChoiceCard
                    key={option.id}
                    name="result-barrier"
                    id={option.id}
                    value={option.id}
                    label={option.label}
                    selected={barrier === option.id}
                    onChange={setBarrier}
                  />
                ))}
              </div>
            </section>

            <section className="pathway-section" aria-labelledby="pathway-title">
              <p className="mini-label">A small route forward</p>
              <h2 id="pathway-title">From today to a real conversation</h2>
              <Timeline result={result} />
            </section>

            <section className="alternatives-section" aria-labelledby="alternatives-title">
              <div className="section-heading-row">
                <div>
                  <p className="mini-label">Keep options open</p>
                  <h2 id="alternatives-title">Two routes to explore</h2>
                </div>
                <span>Exploration only · not current offers</span>
              </div>
              <div className="alternative-grid">
                {result.alternatives.map((route) => (
                  <article className="alternative-card" key={route.title}>
                    <span className="explore-tag">Explore</span>
                    <h3>{route.title}</h3>
                    <p>{route.description}</p>
                    <ExternalLink href={route.resource.url}>{route.resource.organisation}</ExternalLink>
                  </article>
                ))}
              </div>
            </section>

            <aside className="human-help">
              <div className="human-icon" aria-hidden="true">PS</div>
              <div>
                <p className="mini-label">A person, not a chatbot</p>
                <h2>Want to talk it through?</h2>
                <p>Positive Steps offers careers guidance for young people in Oldham.</p>
              </div>
              {positiveStepsUrl && <ExternalLink href={positiveStepsUrl}>Talk to a real adviser</ExternalLink>}
            </aside>

            <aside className="participation-note">
              <strong>Why this isn&apos;t a job search</strong>
              <p>In England, 16–17-year-olds must continue in education or training through a permitted route until 18.</p>
              {participationUrl && <ExternalLink href={participationUrl}>Check GOV.UK guidance</ExternalLink>}
            </aside>

            <div className="result-actions">
              <button className="secondary-button" type="button" onClick={() => setScreen("explore")}>← Change my answers</button>
              <button className="primary-button" type="button" onClick={() => setScreen("passport")}>Make my Passport <span aria-hidden="true">→</span></button>
            </div>
          </section>
        )}

        {screen === "passport" && interest && barrier && result && (
          <section className="passport-screen" aria-labelledby="passport-screen-title">
            <div className="screen-intro passport-intro">
              <p className="eyebrow">Ready to share</p>
              <h1 id="passport-screen-title" tabIndex={-1}>Take it with you</h1>
              <p>Bring this one-page plan to a parent, youth worker, teacher or adviser.</p>
            </div>

            <div className="passport-actions" data-testid="passport-actions">
              <label className="include-toggle">
                <input
                  type="checkbox"
                  checked={includeBarrier}
                  onChange={(event) => {
                    setIncludeBarrier(event.target.checked);
                    setCopyStatus("");
                    setCopyFallback("");
                  }}
                />
                <span>Include my barrier in printed and copied plans</span>
              </label>
              <div className="action-buttons">
                <button className="secondary-button" type="button" onClick={copyPlan}>Copy plan</button>
                <button className="primary-button" type="button" onClick={() => window.print()}>Print / Save PDF</button>
              </div>
              <p className="copy-status" role="status" aria-live="polite">{copyStatus}</p>
              {copyFallback && (
                <textarea className="copy-fallback" readOnly value={copyFallback} aria-label="Plan text to copy manually" />
              )}
            </div>

            <article className="passport" data-testid="passport">
              <div className="passport-header">
                <div className="brand passport-brand"><span className="brand-mark">F</span><span>Oldham <strong>FirstStep</strong></span></div>
                <span>MY PLAN · {new Date().getFullYear()}</span>
              </div>
              <div className="passport-title-row">
                <p className="eyebrow">A simple handoff</p>
                <h2>My FirstStep<br />Passport</h2>
                <p>One interest. One obstacle. One action I can take.</p>
              </div>

              <div className="passport-facts">
                <div><span>I&apos;m interested in</span><strong>{getInterestLabel(interest)}</strong></div>
                {includeBarrier && (
                  <div data-testid="passport-barrier"><span>What&apos;s getting in my way</span><strong>{getBarrierLabel(barrier)}</strong></div>
                )}
              </div>

              <section className="passport-action">
                <span>01 · MY FIRST ACTION</span>
                <h3>{result.firstAction}</h3>
                <p>{result.whyThisStep}</p>
              </section>

              <section className="passport-path">
                <span>02 · MY PATH FORWARD</span>
                <Timeline result={result} />
              </section>

              <div className="passport-bottom-grid">
                <section>
                  <span>03 · WHERE I CAN GO</span>
                  <h3>{result.resource.organisation}</h3>
                  <p>{result.resource.label}</p>
                  <a href={result.resource.url}>{result.resource.url}</a>
                </section>
                <section>
                  <span>04 · A QUESTION I CAN ASK</span>
                  <blockquote>{result.questionToAsk}</blockquote>
                </section>
              </div>

              <div className="passport-warnings">
                {result.warnings.map((warning) => <span key={warning}>Check: {warning}</span>)}
              </div>

              <p className="passport-disclaimer">This is guidance to explore options, not a decision about eligibility or a confirmed course place. A human adviser can help.</p>
            </article>

            <div className="passport-footer-actions">
              <button className="text-button" type="button" onClick={() => setScreen("result")}>← Back to my plan</button>
              <button className="text-button" type="button" onClick={startAgain}>Start again</button>
            </div>
          </section>
        )}
      </main>

      <footer className="site-footer">
        <p><strong>Oldham FirstStep</strong> · Independent hackathon proof of concept — not an official council service.</p>
        <p>No accounts. No saved profiles. No tracking.</p>
      </footer>
    </div>
  );
}

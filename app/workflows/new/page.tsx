"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const FRAMEWORKS = [
  { id: "playwright-js", label: "Playwright", lang: "JavaScript" },
  { id: "playwright-ts", label: "Playwright", lang: "TypeScript" },
  { id: "playwright-py", label: "Playwright", lang: "Python" },
  { id: "selenium-py", label: "Selenium", lang: "Python" },
  { id: "selenium-java", label: "Selenium", lang: "Java" },
  { id: "cypress-js", label: "Cypress", lang: "JavaScript" },
];

export default function NewWorkflowPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [framework, setFramework] = useState("playwright-js");
  const [sessionType, setSessionType] = useState("fresh");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, framework, sessionType }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Something went wrong");
      setLoading(false);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center gap-4">
        <a
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          Back
        </a>
        <span className="font-semibold">New Workflow</span>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Workflow details</CardTitle>
              <CardDescription>
                Give your workflow a name and description
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Workflow name</Label>
                <Input
                  id="title"
                  placeholder="e.g. Login and create project"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  placeholder="What does this workflow do?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Code generation</CardTitle>
              <CardDescription>
                Choose the framework and language for generated code
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {FRAMEWORKS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFramework(f.id)}
                    className={
                      "border rounded-lg p-3 text-left transition-colors " +
                      (framework === f.id
                        ? "border-primary bg-primary/5"
                        : "hover:border-muted-foreground")
                    }
                  >
                    <div className="font-medium text-sm">{f.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.lang}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Browser session</CardTitle>
              <CardDescription>
                Choose how the browser opens when recording
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSessionType("fresh")}
                className={
                  "border rounded-lg p-4 text-left transition-colors " +
                  (sessionType === "fresh"
                    ? "border-primary bg-primary/5"
                    : "hover:border-muted-foreground")
                }
              >
                <div className="font-medium text-sm">Fresh browser</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Clean slate, no cookies. Good for testing.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSessionType("profile")}
                className={
                  "border rounded-lg p-4 text-left transition-colors " +
                  (sessionType === "profile"
                    ? "border-primary bg-primary/5"
                    : "hover:border-muted-foreground")
                }
              >
                <div className="font-medium text-sm">My profile</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Already logged in. Good for automation.
                </div>
              </button>
            </CardContent>
          </Card>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating..." : "Create workflow"}
          </Button>
        </form>
      </main>
    </div>
  );
}

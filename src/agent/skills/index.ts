import * as fs from 'fs'
import * as path from 'path'
import yaml from 'js-yaml'
import { Skill, SkillMetadata, SkillBundle } from '../types'

const skillCache: Map<string, Skill> = new Map()

export async function loadSkills(skillsPath: string): Promise<Skill[]> {
    skillCache.clear()

    const skills: Skill[] = []

    if (!fs.existsSync(skillsPath)) {
        return skills
    }

    const entries = fs.readdirSync(skillsPath, { withFileTypes: true })

    for (const entry of entries) {
        if (entry.isDirectory()) {
            const skillPath = path.join(skillsPath, entry.name)
            const skill = await loadSkill(skillPath)
            if (skill) {
                skills.push(skill)
                skillCache.set(skill.metadata.name, skill)
            }
        }
    }

    return skills
}

async function loadSkill(skillPath: string): Promise<Skill | null> {
    const skillFile = path.join(skillPath, 'SKILL.md')

    if (!fs.existsSync(skillFile)) {
        return null
    }

    const content = fs.readFileSync(skillFile, 'utf-8')

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)

    if (!frontmatterMatch) {
        return null
    }

    const frontmatterContent = frontmatterMatch[1]
    if (frontmatterContent === undefined) {
        return null
    }

    let frontmatter: Record<string, unknown>
    try {
        frontmatter = yaml.load(frontmatterContent) as Record<string, unknown>
    } catch {
        return null
    }

    const metadata: SkillMetadata = {
        name: frontmatter.name as string,
        description: frontmatter.description as string,
        license: frontmatter.license as string | undefined,
        allowedTools: frontmatter['allowed-tools'] ? (frontmatter['allowed-tools'] as string).split(' ').filter(Boolean) : undefined,
        model: frontmatter.model as string | undefined,
        version: frontmatter.version as string | undefined,
        compatibility: frontmatter.compatibility as string | undefined,
        metadata: frontmatter.metadata as Record<string, unknown> | undefined,
    }

    if (!metadata.name || !metadata.description) {
        return null
    }

    const body = content.replace(frontmatterMatch[0], '').trim()

    return {
        metadata,
        content: body,
        directory: skillPath,
    }
}

export function getSkillBundle(skill: Skill): SkillBundle {
    const bundle: SkillBundle = {
        scripts: [],
        references: [],
        examples: [],
    }

    if (!fs.existsSync(skill.directory)) {
        return bundle
    }

    const scriptsDir = path.join(skill.directory, 'scripts')
    if (fs.existsSync(scriptsDir)) {
        bundle.scripts = fs.readdirSync(scriptsDir)
    }

    const referencesDir = path.join(skill.directory, 'references')
    if (fs.existsSync(referencesDir)) {
        bundle.references = fs.readdirSync(referencesDir)
    }

    const examplesDir = path.join(skill.directory, 'examples')
    if (fs.existsSync(examplesDir)) {
        bundle.examples = fs.readdirSync(examplesDir)
    }

    return bundle
}

export function getAllSkillMetadata(): Array<{ name: string; description: string }> {
    return Array.from(skillCache.values()).map(skill => ({
        name: skill.metadata.name,
        description: skill.metadata.description,
    }))
}

export function getSkillByName(name: string): Skill | undefined {
    return skillCache.get(name)
}

export async function loadSkillFile(skillName: string, filename: string): Promise<string | null> {
    const skill = skillCache.get(skillName)
    if (!skill) {
        return null
    }

    const filePath = path.join(skill.directory, filename)
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8')
    }

    return null
}

export function isSkillLoaded(name: string): boolean {
    return skillCache.has(name)
}

export function getLoadedSkillsCount(): number {
    return skillCache.size
}

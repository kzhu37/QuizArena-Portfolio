function New-Pool {
  param(
    [string]$RoundType,
    [string]$DisplayTitle,
    [string]$Family,
    [string[]]$Tags,
    [hashtable]$ManualSlots,
    [string]$PackKey = ""
  )

  $slugSource =
    if ([string]::IsNullOrWhiteSpace($PackKey)) { $DisplayTitle }
    else { "$DisplayTitle $PackKey" }
  $slug = ($slugSource.ToLowerInvariant() -replace '[^a-z0-9]+', '-') -replace '^-+|-+$', ''

  return @{
    packId = "$RoundType|$slug"
    roundType = $RoundType
    displayTitle = $DisplayTitle
    family = $Family
    tags = @($Tags)
    manualSlots = if ($ManualSlots) { $ManualSlots } else { @{} }
  }
}

function New-FinalCategory {
  param(
    [string]$Category,
    [object[]]$Clues
  )

  return @{
    category = $Category
    clues = @($Clues)
  }
}

$JeopardyBankBlueprint = @{
  Regular = @()
  Finals = @()
}

function Add-ExpandedTsvPool {
  param([hashtable]$Pool)

  if (-not $Pool) { return }
  $manualSlots = @{}
  foreach ($slotKey in $Pool.slots.Keys) {
    $manualSlots[$slotKey] = @($Pool.slots[$slotKey])
  }

  $JeopardyBankBlueprint.Regular += (New-Pool `
    $Pool.roundType `
    $Pool.displayTitle `
    $Pool.family `
    @($Pool.tags) `
    $manualSlots `
    $Pool.packKey)
}

function Add-ExpandedTsvFinalCategory {
  param([hashtable]$FinalCategory)

  if (-not $FinalCategory) { return }
  $JeopardyBankBlueprint.Finals += (New-FinalCategory $FinalCategory.category @($FinalCategory.clues))
}

function Add-ExpandedBankFromTsv {
  param([string]$Path)

  $currentKind = ''
  $currentPool = $null
  $currentFinal = $null

  foreach ($rawLine in (Get-Content -Path $Path -Encoding UTF8)) {
    $line = $rawLine.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }

    $parts = $line -split "`t"
    switch ($parts[0]) {
      'REGULAR' {
        Add-ExpandedTsvPool $currentPool
        Add-ExpandedTsvFinalCategory $currentFinal
        $currentKind = 'regular'
        $tagText = if ($parts.Count -ge 5) { $parts[4] } else { '' }
        $packKey = if ($parts.Count -ge 6) { $parts[5] } else { '' }
        $currentPool = @{
          roundType = $parts[1]
          displayTitle = $parts[2]
          family = $parts[3]
          tags = @($tagText -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
          packKey = $packKey
          slots = @{}
        }
        $currentFinal = $null
      }
      'FINAL' {
        Add-ExpandedTsvPool $currentPool
        Add-ExpandedTsvFinalCategory $currentFinal
        $currentKind = 'final'
        $currentFinal = @{
          category = $parts[1]
          clues = @()
        }
        $currentPool = $null
      }
      'END' {
        Add-ExpandedTsvPool $currentPool
        Add-ExpandedTsvFinalCategory $currentFinal
        $currentKind = ''
        $currentPool = $null
        $currentFinal = $null
      }
      default {
        if ($currentKind -eq 'regular') {
          if ($parts.Count -ne 4) { throw "Malformed regular row: $line" }
          $slotKey = $parts[0]
          if (-not $currentPool.slots.ContainsKey($slotKey)) { $currentPool.slots[$slotKey] = @() }
          $currentPool.slots[$slotKey] += ,@($parts[2], $parts[3], [int]$parts[1])
        }
        elseif ($currentKind -eq 'final') {
          if ($parts.Count -ne 3) { throw "Malformed final row: $line" }
          $currentFinal.clues += ,@($parts[1], $parts[2], [int]$parts[0])
        }
        else {
          throw "Jeopardy TSV row appears outside a category block: $line"
        }
      }
    }
  }

  Add-ExpandedTsvPool $currentPool
  Add-ExpandedTsvFinalCategory $currentFinal
}

$expandedTsvPath = Join-Path $PSScriptRoot 'expanded-bank.tsv'
if (-not (Test-Path $expandedTsvPath)) {
  throw "Missing Jeopardy TSV source: $expandedTsvPath"
}

Add-ExpandedBankFromTsv $expandedTsvPath

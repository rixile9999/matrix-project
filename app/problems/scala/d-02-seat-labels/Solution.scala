def seats(rows: List[Int], cols: List[Char]): List[String] =
  rows.flatMap(r => cols.map(c => s"$r$c"))

def intDouble(rng: RNG): ((Int, Double), RNG) =
  val (i, r1) = rng.nextInt
  val (d, r2) = double(r1)
  ((i, d), r2)

def doubleInt(rng: RNG): ((Double, Int), RNG) =
  val (d, r1) = double(rng)
  val (i, r2) = r1.nextInt
  ((d, i), r2)

def double3(rng: RNG): ((Double, Double, Double), RNG) =
  val (d1, r1) = double(rng)
  val (d2, r2) = double(r1)
  val (d3, r3) = double(r2)
  ((d1, d2, d3), r3)

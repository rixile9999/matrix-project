def map2[A, B, C](ra: Rand[A], rb: Rand[B])(f: (A, B) => C): Rand[C] =
  rng =>
    val (a, r1) = ra(rng)
    val (b, r2) = rb(r1)
    (f(a, b), r2)

def randIntDouble: Rand[(Int, Double)] =
  map2(int, randDouble)((_, _))

def randDoubleInt: Rand[(Double, Int)] =
  map2(randDouble, int)((_, _))

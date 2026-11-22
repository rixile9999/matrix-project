trait RNG:
  def nextInt: (Int, RNG)

case class SimpleRNG(seed: Long) extends RNG:
  def nextInt: (Int, RNG) =
    val newSeed = (seed * 0x5DEECE66DL + 0xBL) & 0xFFFFFFFFFFFFL
    val nextRNG = SimpleRNG(newSeed)
    val n = (newSeed >>> 16).toInt
    (n, nextRNG)

def nonNegativeInt(rng: RNG): (Int, RNG) =
  val (i, r) = rng.nextInt
  (if i < 0 then -(i + 1) else i, r)

type Rand[+A] = RNG => (A, RNG)

val int: Rand[Int] = _.nextInt

def unit[A](a: A): Rand[A] =
  rng => (a, rng)

def map[A, B](s: Rand[A])(f: A => B): Rand[B] =
  rng =>
    val (a, rng2) = s(rng)
    (f(a), rng2)

def randDouble: Rand[Double] =
  map(nonNegativeInt)(_ / (Int.MaxValue.toDouble + 1))

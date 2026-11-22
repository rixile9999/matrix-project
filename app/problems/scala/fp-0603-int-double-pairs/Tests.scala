case class ScriptRNG(vs: Vector[Int], i: Int = 0) extends RNG:
  def nextInt: (Int, RNG) = (vs(i % vs.size), ScriptRNG(vs, i + 1))

def scriptRng(vs: Int*): ScriptRNG = ScriptRNG(vs.toVector)

def seeds: scala.List[SimpleRNG] = (1L to 300L).toList.map(s => SimpleRNG(s * 1000003L * 1000003L))

@main def tests(): Unit =
  val a = Vector(-5, 1073741824)
  val b = Vector(1073741824, -5)
  val c = Vector(1073741824, 0, Int.MaxValue)
  Judge.check("intDouble 순서와 RNG")(intDouble(ScriptRNG(a)), ((-5, 0.5), ScriptRNG(a, 2)))
  Judge.check("doubleInt 순서와 RNG")(doubleInt(ScriptRNG(b)), ((0.5, -5), ScriptRNG(b, 2)))
  Judge.check("double3 세 값과 RNG")(double3(ScriptRNG(c)), ((0.5, 0.0, Int.MaxValue / 2147483648.0), ScriptRNG(c, 3)))
  val r = SimpleRNG(42)
  val (i, r1) = r.nextInt
  val (d, r2) = double(r1)
  Judge.check("SimpleRNG 에서 intDouble")(intDouble(r), ((i, d), r2))
  val (d0, q1) = double(r)
  val (j, q2) = q1.nextInt
  Judge.check("SimpleRNG 에서 doubleInt")(doubleInt(r), ((d0, j), q2))
  val (e1, s1) = double(r)
  val (e2, s2) = double(s1)
  val (e3, s3) = double(s2)
  Judge.check("SimpleRNG 에서 double3")(double3(r), ((e1, e2, e3), s3))
  Judge.check("double3 의 세 값은 서로 다르다")({ val ((x, y, z), _) = double3(SimpleRNG(1)); scala.collection.immutable.Set(x, y, z).size }, 3)

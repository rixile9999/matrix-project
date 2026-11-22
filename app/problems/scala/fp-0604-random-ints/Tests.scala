case class ScriptRNG(vs: Vector[Int], i: Int = 0) extends RNG:
  def nextInt: (Int, RNG) = (vs(i % vs.size), ScriptRNG(vs, i + 1))

def scriptRng(vs: Int*): ScriptRNG = ScriptRNG(vs.toVector)

def seeds: scala.List[SimpleRNG] = (1L to 300L).toList.map(s => SimpleRNG(s * 1000003L * 1000003L))

@main def tests(): Unit =
  val v = Vector(1, 2, 3, 4)
  Judge.check("0개는 받은 RNG 그대로")(ints(0)(ScriptRNG(v)), (scala.List.empty[Int], ScriptRNG(v)))
  Judge.check("앞에서부터 순서대로")(ints(3)(ScriptRNG(v)), (scala.List(1, 2, 3), ScriptRNG(v, 3)))
  Judge.check("음수도 그대로")(ints(2)(scriptRng(-9, Int.MinValue))._1, scala.List(-9, Int.MinValue))
  Judge.check("한 개")(ints(1)(ScriptRNG(v, 2)), (scala.List(3), ScriptRNG(v, 3)))
  val r = SimpleRNG(7)
  val (a, r1) = r.nextInt
  val (b, r2) = r1.nextInt
  val (c, r3) = r2.nextInt
  Judge.check("SimpleRNG 와 수동 전개가 일치")(ints(3)(r), (scala.List(a, b, c), r3))
  Judge.check("개수")(ints(500)(r)._1.size, 500)
